import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database.js";

const databases: AppDatabase[] = [];
function createDatabase(): AppDatabase {
  const database = new AppDatabase(":memory:"); databases.push(database); return database;
}

afterEach(() => databases.splice(0).forEach((database) => database.close()));

describe("AppDatabase", () => {
  it("stores independent rules for each channel", () => {
    const database = createDatabase();
    const first = database.addChannel({ youtubeChannelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "First", handle: "@first" });
    const second = database.addChannel({ youtubeChannelId: "UCbbbbbbbbbbbbbbbbbbbbbb", title: "Second", handle: "@second" });
    database.updateChannelRules(first.id, {
      includeKeywords: ["analysis"], excludeKeywords: ["live"], minDurationSeconds: 180, maxDurationSeconds: 3600,
    });

    expect(database.getChannel(first.id)).toMatchObject({ includeKeywords: ["analysis"], excludeKeywords: ["live"], minDurationSeconds: 180, maxDurationSeconds: 3600 });
    expect(database.getChannel(second.id)).toMatchObject({ includeKeywords: [], excludeKeywords: [], minDurationSeconds: null, maxDurationSeconds: null });
  });

  it("deduplicates uploads and claims queued work once", () => {
    const database = createDatabase();
    const channel = database.addChannel({ youtubeChannelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "First", handle: null });
    const metadata = {
      videoId: "video-one", channelYoutubeId: channel.youtubeChannelId, title: "New video", description: "",
      publishedAt: "2026-09-08T12:00:00.000Z", durationSeconds: 900, captionsAvailable: true, thumbnailUrl: null,
    };
    expect(database.insertVideo(channel.id, metadata, "queued", null)).toBe(true);
    expect(database.insertVideo(channel.id, metadata, "queued", null)).toBe(false);
    expect(database.claimNextVideo("2026-09-08T13:00:00.000Z")?.youtubeVideoId).toBe("video-one");
    expect(database.claimNextVideo("2026-09-08T13:00:00.000Z")).toBeNull();
  });
});
