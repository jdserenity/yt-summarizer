import formbody from "@fastify/formbody";
import Fastify, { type FastifyInstance } from "fastify";
import MarkdownIt from "markdown-it";
import { timingSafeEqual } from "node:crypto";
import type { AppConfig } from "./config.js";
import { AppDatabase } from "./database.js";
import { normalizeKeywords } from "./filters.js";
import { styles } from "./styles.js";
import type { UploadNotification } from "./youtube.js";
import { channelIdFromInput, parseYouTubeNotification } from "./youtube.js";
import { articlePage, channelPage, channelsPage, homePage } from "./views.js";

interface AppYouTubeClient {
  resolveChannel(input: string): Promise<{ youtubeChannelId: string; title: string; handle: string | null }>;
  getRecentUploads(channelId: string): Promise<UploadNotification[]>;
  subscribe(channelId: string, callbackUrl: string, verifyToken: string): Promise<void>;
}

interface AppProcessor {
  discover(videoId: string, channelYoutubeId: string): Promise<boolean>;
  processNext(): Promise<boolean>;
}

export interface AppDependencies {
  config: AppConfig;
  database: AppDatabase;
  youtube: AppYouTubeClient;
  processor: AppProcessor;
  startBackgroundWork?: boolean;
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const { config, database, youtube, processor } = dependencies;
  const app = Fastify({ logger: dependencies.startBackgroundWork !== false });
  const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
  app.register(formbody);
  app.addContentTypeParser(["application/atom+xml", "application/xml", "text/xml"], { parseAs: "string" }, (_request, body, done) => done(null, body));
  app.addHook("onRequest", async (request, reply) => {
    if (!config.appPassword || request.url.startsWith("/webhooks/youtube") || request.url === "/health" || request.url === "/styles.css") return;
    const credentials = decodeBasicAuth(request.headers.authorization);
    if (credentials && safeEqual(credentials.username, config.appUsername) && safeEqual(credentials.password, config.appPassword)) return;
    return reply.header("www-authenticate", 'Basic realm="Distilled"').code(401).send("Authentication required");
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/styles.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(styles));
  app.get("/", async (request, reply) => {
    const query = request.query as { notice?: string };
    return reply.type("text/html").send(homePage(database.listVideos(), query.notice));
  });
  app.get("/channels", async (request, reply) => {
    const query = request.query as { notice?: string; error?: string };
    return reply.type("text/html").send(channelsPage(database.listChannels(), query.notice, query.error));
  });
  app.post("/channels", async (request, reply) => {
    const input = String((request.body as Record<string, unknown>).channel ?? "").trim();
    try {
      const metadata = await youtube.resolveChannel(input);
      const channel = database.addChannel(metadata);
      if (config.publicUrl) await youtube.subscribe(channel.youtubeChannelId, `${config.publicUrl}/webhooks/youtube`, config.websubVerifyToken);
      return reply.redirect(`/channels/${channel.id}`, 303);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.redirect(`/channels?error=${encodeURIComponent(message)}`, 303);
    }
  });
  app.get("/channels/:id", async (request, reply) => {
    const channel = database.getChannel(Number((request.params as { id: string }).id));
    if (!channel) return reply.code(404).send("Channel not found");
    const query = request.query as { error?: string };
    return reply.type("text/html").send(channelPage(channel, query.error));
  });
  app.post("/channels/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const channel = database.getChannel(id);
    if (!channel) return reply.code(404).send("Channel not found");
    const body = request.body as Record<string, unknown>;
    const minDurationSeconds = minutesValue(body.minMinutes);
    const maxDurationSeconds = minutesValue(body.maxMinutes);
    if (minDurationSeconds !== null && maxDurationSeconds !== null && minDurationSeconds > maxDurationSeconds) {
      return reply.type("text/html").code(400).send(channelPage(channel, "Minimum length cannot exceed maximum length."));
    }
    database.updateChannelRules(id, {
      includeKeywords: normalizeKeywords(String(body.includeKeywords ?? "")),
      excludeKeywords: normalizeKeywords(String(body.excludeKeywords ?? "")),
      minDurationSeconds, maxDurationSeconds,
    });
    database.setChannelActive(id, body.active === "on");
    return reply.redirect("/channels?notice=Channel+filters+saved", 303);
  });
  app.post("/channels/:id/delete", async (request, reply) => {
    database.deleteChannel(Number((request.params as { id: string }).id));
    return reply.redirect("/channels?notice=Channel+removed", 303);
  });
  app.post("/channels/:id/sync", async (request, reply) => {
    const channel = database.getChannel(Number((request.params as { id: string }).id));
    if (!channel) return reply.code(404).send("Channel not found");
    try {
      await syncChannel(channel.id, channel.youtubeChannelId, youtube, processor, database);
      return reply.redirect("/channels?notice=Channel+checked", 303);
    } catch (error) {
      return reply.redirect(`/channels?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`, 303);
    }
  });
  app.get("/articles/:id", async (request, reply) => {
    const video = database.getVideo(Number((request.params as { id: string }).id));
    if (!video || video.status !== "ready" || !video.articleMarkdown) return reply.code(404).send("Article not found");
    return reply.type("text/html").send(articlePage(video, markdown.render(video.articleMarkdown)));
  });
  app.post("/articles/:id/read", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    database.markRead(id, (request.body as Record<string, unknown>).read === "true");
    return reply.redirect(`/articles/${id}`, 303);
  });
  app.post("/videos/:id/retry", async (request, reply) => {
    database.retryVideo(Number((request.params as { id: string }).id));
    return reply.redirect("/?notice=Video+queued+for+retry", 303);
  });
  app.get("/webhooks/youtube", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const channelId = channelIdFromInput(query["hub.topic"] ?? "");
    const channel = channelId ? database.getChannelByYoutubeId(channelId) : null;
    if (!channel || (config.websubVerifyToken && query["hub.verify_token"] !== config.websubVerifyToken)) return reply.code(403).send("Invalid verification");
    if (query["hub.mode"] === "subscribe") {
      const seconds = Number(query["hub.lease_seconds"] ?? 0);
      if (seconds > 0) database.updateWebsubLease(channel.id, new Date(Date.now() + seconds * 1000).toISOString());
    }
    return reply.type("text/plain").send(query["hub.challenge"] ?? "");
  });
  app.post("/webhooks/youtube", async (request, reply) => {
    const uploads = parseYouTubeNotification(String(request.body ?? ""));
    for (const upload of uploads) await processor.discover(upload.videoId, upload.channelId);
    return reply.code(204).send();
  });

  if (dependencies.startBackgroundWork !== false) startBackgroundWork(app, config, database, youtube, processor);
  return app;
}

function startBackgroundWork(app: FastifyInstance, config: AppConfig, database: AppDatabase, youtube: AppYouTubeClient, processor: AppProcessor): void {
  database.resetInterruptedWork();
  let workerBusy = false; let maintenanceBusy = false;
  const worker = async () => {
    if (workerBusy) return; workerBusy = true;
    try { while (await processor.processNext()) {} } catch (error) { app.log.error(error); } finally { workerBusy = false; }
  };
  const maintenance = async () => {
    if (maintenanceBusy) return; maintenanceBusy = true;
    try {
      for (const channel of database.listChannels().filter((item) => item.active)) {
        try {
          await syncChannel(channel.id, channel.youtubeChannelId, youtube, processor, database);
          const leaseExpiresSoon = !channel.websubLeaseExpiresAt || new Date(channel.websubLeaseExpiresAt).getTime() < Date.now() + 3 * 86400_000;
          if (config.publicUrl && leaseExpiresSoon) await youtube.subscribe(channel.youtubeChannelId, `${config.publicUrl}/webhooks/youtube`, config.websubVerifyToken);
        } catch (error) { app.log.error({ error, channel: channel.youtubeChannelId }, "Channel maintenance failed"); }
      }
    } finally { maintenanceBusy = false; }
  };
  const workerTimer = setInterval(() => void worker(), config.workerIntervalSeconds * 1000);
  const maintenanceTimer = setInterval(() => void maintenance(), config.maintenanceIntervalMinutes * 60_000);
  void worker(); void maintenance();
  app.addHook("onClose", async () => { clearInterval(workerTimer); clearInterval(maintenanceTimer); });
}

async function syncChannel(id: number, youtubeChannelId: string, youtube: AppYouTubeClient, processor: AppProcessor, database: AppDatabase): Promise<void> {
  const channel = database.getChannel(id);
  if (!channel) return;
  const uploads = await youtube.getRecentUploads(youtubeChannelId);
  for (const upload of uploads) {
    if (new Date(upload.publishedAt).getTime() >= new Date(channel.addedAt).getTime()) await processor.discover(upload.videoId, upload.channelId);
  }
  database.updateChannelSync(id, new Date().toISOString());
}

function minutesValue(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60) : null;
}

function decodeBasicAuth(value: string | undefined): { username: string; password: string } | null {
  if (!value?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator < 0 ? null : { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch { return null; }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
