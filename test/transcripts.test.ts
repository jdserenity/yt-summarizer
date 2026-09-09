import { describe, expect, it, vi } from "vitest";
import { SupadataTranscriptProvider } from "../src/transcripts.js";

describe("SupadataTranscriptProvider", () => {
  it("requests native captions and preserves timestamped chunks", async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({
      content: [{ text: "Useful point", offset: 1250, duration: 900, lang: "en" }],
      lang: "en",
      availableLangs: ["en"],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new SupadataTranscriptProvider("secret", fetcher);

    const result = await provider.getTranscript("abc123");

    const url = new URL(fetcher.mock.calls[0][0] as string);
    expect(url.searchParams.get("mode")).toBe("native");
    expect(url.searchParams.get("text")).toBe("false");
    expect(url.searchParams.get("url")).toBe("https://www.youtube.com/watch?v=abc123");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { "x-api-key": "secret" } });
    expect(result).toEqual({ chunks: [{ text: "Useful point", offsetMs: 1250, durationMs: 900 }], language: "en" });
  });

  it("returns unavailable without generating a transcript", async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({ error: "transcript-unavailable" }), { status: 206 }));
    const provider = new SupadataTranscriptProvider("secret", fetcher);
    await expect(provider.getTranscript("abc123")).resolves.toBeNull();
  });
});
