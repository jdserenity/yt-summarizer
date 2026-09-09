import { describe, expect, it, vi } from "vitest";
import { channelIdFromInput, parseYouTubeNotification, YouTubeClient } from "../src/youtube.js";

describe("channelIdFromInput", () => {
  it("extracts direct channel IDs", () => {
    expect(channelIdFromInput("UC_x5XG1OV2P6uZZ5FSM9Ttw")).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
    expect(channelIdFromInput("https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw/videos")).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
  });

  it("leaves handles for API resolution", () => {
    expect(channelIdFromInput("https://youtube.com/@googledevelopers")).toBeNull();
  });
});

describe("parseYouTubeNotification", () => {
  it("reads a YouTube Atom upload notification", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
        <entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><yt:channelId>UCuAXFkgsw1L7xaCfnd5JJOw</yt:channelId>
        <title>Video title</title><published>2026-09-08T12:00:00+00:00</published></entry>
      </feed>`;
    expect(parseYouTubeNotification(xml)).toEqual([{
      videoId: "dQw4w9WgXcQ",
      channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
      title: "Video title",
      publishedAt: "2026-09-08T12:00:00+00:00",
    }]);
  });
});

describe("YouTubeClient", () => {
  it("resolves a handle without subscribing the user's YouTube account", async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({ items: [{
      id: "UC_x5XG1OV2P6uZZ5FSM9Ttw", snippet: { title: "Google Developers", customUrl: "@googledevelopers" },
    }] }), { status: 200 }));
    const client = new YouTubeClient("api-key", fetcher);
    await expect(client.resolveChannel("https://youtube.com/@googledevelopers")).resolves.toEqual({
      youtubeChannelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw", title: "Google Developers", handle: "@googledevelopers",
    });
    const url = new URL(fetcher.mock.calls[0][0] as string);
    expect(url.searchParams.get("forHandle")).toBe("@googledevelopers");
  });

  it("retrieves duration and caption availability before paid processing", async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({ items: [{
      id: "video-one",
      snippet: { channelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw", title: "A useful video", description: "Details", publishedAt: "2026-09-08T12:00:00Z", thumbnails: { high: { url: "https://example.com/thumb.jpg" } } },
      contentDetails: { duration: "PT1H2M3S", caption: "true" },
    }] }), { status: 200 }));
    const client = new YouTubeClient("api-key", fetcher);
    await expect(client.getVideo("video-one")).resolves.toEqual({
      videoId: "video-one", channelYoutubeId: "UC_x5XG1OV2P6uZZ5FSM9Ttw", title: "A useful video", description: "Details",
      publishedAt: "2026-09-08T12:00:00Z", durationSeconds: 3723, captionsAvailable: true, thumbnailUrl: "https://example.com/thumb.jpg",
    });
  });
});
