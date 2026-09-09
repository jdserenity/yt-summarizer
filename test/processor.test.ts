import { afterEach, describe, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/database.js";
import { VideoProcessor } from "../src/processor.js";
import type { SummaryProvider, TranscriptProvider, VideoMetadata } from "../src/types.js";

const databases: AppDatabase[] = [];
const now = new Date("2026-09-08T13:00:00.000Z");
const metadata: VideoMetadata = {
  videoId: "video-one", channelYoutubeId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "Weekly analysis", description: "Description",
  publishedAt: "2026-09-08T12:00:00.000Z", durationSeconds: 1800, captionsAvailable: true, thumbnailUrl: "https://example.com/thumb.jpg",
};

function setup() {
  const database = new AppDatabase(":memory:"); databases.push(database);
  const channel = database.addChannel({ youtubeChannelId: metadata.channelYoutubeId, title: "Creator", handle: null });
  const youtube = { getVideo: vi.fn(async () => metadata) };
  const transcripts: TranscriptProvider = { getTranscript: vi.fn(async () => ({ language: "en", chunks: [{ text: "Useful point", offsetMs: 1000, durationMs: 500 }] })) };
  const summaries: SummaryProvider = {
    provider: "xai", model: "grok-4.6",
    summarize: vi.fn(async () => ({
      title: "Useful article", dek: "A concise explanation.", articleMarkdown: "Useful article body.",
      keyLearnings: ["Useful point"], watchSegments: [],
      usage: { inputTokens: 5000, outputTokens: 1000, reasoningTokens: 100 },
    })),
  };
  const processor = new VideoProcessor(database, youtube, transcripts, summaries, () => now);
  return { database, channel, youtube, transcripts, summaries, processor };
}

afterEach(() => databases.splice(0).forEach((database) => database.close()));

describe("VideoProcessor", () => {
  it("applies channel title filters before any paid request", async () => {
    const { database, channel, transcripts, summaries, processor } = setup();
    database.updateChannelRules(channel.id, { ...channel, excludeKeywords: ["weekly"] });
    await processor.discover("video-one", metadata.channelYoutubeId);

    expect(database.getVideoByYoutubeId("video-one")).toMatchObject({ status: "skipped", skipReason: "Title matched excluded keyword: weekly" });
    expect(transcripts.getTranscript).not.toHaveBeenCalled();
    expect(summaries.summarize).not.toHaveBeenCalled();
  });

  it("applies channel duration filters before any paid request", async () => {
    const { database, channel, transcripts, processor } = setup();
    database.updateChannelRules(channel.id, { ...channel, maxDurationSeconds: 1200 });
    await processor.discover("video-one", metadata.channelYoutubeId);
    expect(database.getVideoByYoutubeId("video-one")).toMatchObject({ status: "skipped", skipReason: "Video is longer than 20 minutes" });
    expect(transcripts.getTranscript).not.toHaveBeenCalled();
  });

  it("waits for YouTube captions before paying for a transcript", async () => {
    const { database, youtube, transcripts, processor } = setup();
    youtube.getVideo.mockResolvedValue({ ...metadata, captionsAvailable: false });
    await processor.discover("video-one", metadata.channelYoutubeId);
    expect(database.getVideoByYoutubeId("video-one")).toMatchObject({ status: "waiting_captions" });
    expect(transcripts.getTranscript).not.toHaveBeenCalled();
  });

  it("turns an accepted queued upload into an article", async () => {
    const { database, transcripts, summaries, processor } = setup();
    await processor.discover("video-one", metadata.channelYoutubeId);
    expect(database.getVideoByYoutubeId("video-one")).toMatchObject({ status: "queued" });

    await processor.processNext();

    expect(transcripts.getTranscript).toHaveBeenCalledWith("video-one");
    expect(summaries.summarize).toHaveBeenCalledOnce();
    expect(database.getVideoByYoutubeId("video-one")).toMatchObject({
      status: "ready", articleTitle: "Useful article", summaryProvider: "xai", summaryModel: "grok-4.6",
    });
  });
});
