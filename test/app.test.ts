import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { AppDatabase } from "../src/database.js";
import type { AppConfig } from "../src/config.js";

const databases: AppDatabase[] = [];
const config: AppConfig = {
  host: "127.0.0.1", port: 8010, databasePath: ":memory:", publicUrl: "https://reader.example.com",
  youtubeApiKey: "youtube-key", supadataApiKey: "supadata-key", summaryProvider: "xai", summaryModel: "grok-4.6",
  summaryReasoningEffort: "low", summaryApiKey: "xai-key", appUsername: "reader", appPassword: "",
  websubVerifyToken: "verify-secret", maintenanceIntervalMinutes: 360, workerIntervalSeconds: 15,
};

function setup() {
  const database = new AppDatabase(":memory:"); databases.push(database);
  const youtube = {
    resolveChannel: vi.fn(async () => ({ youtubeChannelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw", title: "Google Developers", handle: "@googledevelopers" })),
    getRecentUploads: vi.fn(async () => []),
    subscribe: vi.fn(async () => undefined),
  };
  const processor = { discover: vi.fn(async () => true), processNext: vi.fn(async () => false) };
  const app = buildApp({ config, database, youtube, processor, startBackgroundWork: false });
  return { app, database, youtube, processor };
}

afterEach(async () => {
  databases.splice(0).forEach((database) => database.close());
});

describe("web app", () => {
  it("adds an independently followed channel", async () => {
    const { app, database, youtube } = setup();
    const response = await app.inject({ method: "POST", url: "/channels", payload: "channel=https%3A%2F%2Fyoutube.com%2F%40googledevelopers", headers: { "content-type": "application/x-www-form-urlencoded" } });
    await app.close();
    expect(response.statusCode).toBe(303);
    expect(youtube.resolveChannel).toHaveBeenCalledOnce();
    expect(database.listChannels()).toHaveLength(1);
  });

  it("saves all filters on the individual channel", async () => {
    const { app, database } = setup();
    const channel = database.addChannel({ youtubeChannelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw", title: "Google Developers", handle: "@googledevelopers" });
    const response = await app.inject({
      method: "POST", url: `/channels/${channel.id}`,
      payload: "includeKeywords=analysis%2Ctutorial&excludeKeywords=livestream%0Ashorts&minMinutes=4&maxMinutes=90&active=on",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    await app.close();
    expect(response.statusCode).toBe(303);
    expect(database.getChannel(channel.id)).toMatchObject({
      includeKeywords: ["analysis", "tutorial"], excludeKeywords: ["livestream", "shorts"], minDurationSeconds: 240, maxDurationSeconds: 5400,
    });
  });

  it("accepts valid YouTube WebSub verification without app authentication", async () => {
    const { app, database } = setup();
    database.addChannel({ youtubeChannelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw", title: "Google Developers", handle: null });
    const query = new URLSearchParams({
      "hub.mode": "subscribe", "hub.challenge": "challenge-value", "hub.verify_token": "verify-secret", "hub.lease_seconds": "864000",
      "hub.topic": "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw",
    });
    const response = await app.inject({ method: "GET", url: `/webhooks/youtube?${query}` });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("challenge-value");
  });
});
