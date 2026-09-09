import { XMLParser } from "fast-xml-parser";
import type { ChannelMetadata, VideoMetadata } from "./types.js";

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface UploadNotification {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
}

const channelIdPattern = /UC[A-Za-z0-9_-]{22}/;

export function channelIdFromInput(input: string): string | null {
  return input.match(channelIdPattern)?.[0] ?? null;
}

export function handleFromInput(input: string): string | null {
  const match = input.trim().match(/(?:youtube\.com\/)?@([A-Za-z0-9._-]+)/i);
  return match ? `@${match[1]}` : null;
}

export function parseYouTubeNotification(xml: string): UploadNotification[] {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
  const parsed = parser.parse(xml) as { feed?: { entry?: unknown } };
  const rawEntries = parsed.feed?.entry;
  if (!rawEntries) return [];
  const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
  return entries.flatMap((raw) => {
    const entry = raw as Record<string, unknown>;
    if (typeof entry.videoId !== "string" || typeof entry.channelId !== "string") return [];
    return [{
      videoId: entry.videoId,
      channelId: entry.channelId,
      title: typeof entry.title === "string" ? entry.title : "Untitled video",
      publishedAt: typeof entry.published === "string" ? entry.published : new Date().toISOString(),
    }];
  });
}

export class YouTubeClient {
  constructor(private readonly apiKey: string, private readonly fetcher: Fetcher = fetch) {}

  async resolveChannel(input: string): Promise<ChannelMetadata> {
    const id = channelIdFromInput(input);
    const handle = handleFromInput(input);
    if (!id && !handle) throw new Error("Use a YouTube @handle, channel URL, or channel ID");
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "snippet");
    url.searchParams.set(id ? "id" : "forHandle", id ?? handle!);
    url.searchParams.set("key", this.apiKey);
    const body = await this.getJson(url);
    const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
    const channel = items[0];
    if (!channel || typeof channel.id !== "string") throw new Error("YouTube channel was not found");
    const snippet = (channel.snippet ?? {}) as Record<string, unknown>;
    return {
      youtubeChannelId: channel.id,
      title: typeof snippet.title === "string" ? snippet.title : handle ?? channel.id,
      handle: typeof snippet.customUrl === "string" ? snippet.customUrl : handle,
    };
  }

  async getVideo(videoId: string): Promise<VideoMetadata> {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", this.apiKey);
    const body = await this.getJson(url);
    const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
    const video = items[0];
    if (!video || typeof video.id !== "string") throw new Error("YouTube video was not found or is not public");
    const snippet = (video.snippet ?? {}) as Record<string, unknown>;
    const content = (video.contentDetails ?? {}) as Record<string, unknown>;
    const thumbnails = (snippet.thumbnails ?? {}) as Record<string, Record<string, unknown>>;
    const thumbnail = thumbnails.maxres ?? thumbnails.standard ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default;
    if (typeof snippet.channelId !== "string" || typeof snippet.title !== "string" || typeof snippet.publishedAt !== "string") {
      throw new Error("YouTube returned incomplete video metadata");
    }
    return {
      videoId: video.id,
      channelYoutubeId: snippet.channelId,
      title: snippet.title,
      description: typeof snippet.description === "string" ? snippet.description : "",
      publishedAt: snippet.publishedAt,
      durationSeconds: parseIsoDuration(typeof content.duration === "string" ? content.duration : "PT0S"),
      captionsAvailable: content.caption === "true",
      thumbnailUrl: typeof thumbnail?.url === "string" ? thumbnail.url : null,
    };
  }

  async getRecentUploads(channelId: string): Promise<UploadNotification[]> {
    const response = await this.fetcher(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
    if (!response.ok) throw new Error(`YouTube feed request failed (${response.status})`);
    return parseYouTubeNotification(await response.text());
  }

  async subscribe(channelId: string, callbackUrl: string, verifyToken: string): Promise<void> {
    const body = new URLSearchParams({
      "hub.callback": callbackUrl,
      "hub.mode": "subscribe",
      "hub.topic": `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      "hub.verify": "async",
      "hub.verify_token": verifyToken,
    });
    const response = await this.fetcher("https://pubsubhubbub.appspot.com/subscribe", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
    });
    if (!response.ok && response.status !== 202 && response.status !== 204) throw new Error(`YouTube WebSub registration failed (${response.status})`);
  }

  private async getJson(url: URL): Promise<Record<string, unknown>> {
    const response = await this.fetcher(url);
    if (!response.ok) throw new Error(`YouTube API request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return response.json() as Promise<Record<string, unknown>>;
  }
}

function parseIsoDuration(value: string): number {
  const match = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  return Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
}
