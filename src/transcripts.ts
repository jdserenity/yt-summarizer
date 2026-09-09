import type { TranscriptProvider, TranscriptResult } from "./types.js";

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface SupadataChunk {
  text?: unknown;
  offset?: unknown;
  duration?: unknown;
}

interface SupadataResponse {
  content?: unknown;
  lang?: unknown;
  jobId?: unknown;
  status?: unknown;
}

export class SupadataTranscriptProvider implements TranscriptProvider {
  constructor(private readonly apiKey: string, private readonly fetcher: Fetcher = fetch) {}

  async getTranscript(videoId: string): Promise<TranscriptResult | null> {
    const url = new URL("https://api.supadata.ai/v1/transcript");
    url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set("text", "false");
    url.searchParams.set("mode", "native");
    const response = await this.fetcher(url.toString(), { headers: { "x-api-key": this.apiKey } });
    if (response.status === 206 || response.status === 404) return null;
    if (!response.ok) throw new Error(`Supadata transcript request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    const body = await response.json() as SupadataResponse;
    if (typeof body.jobId === "string") return this.waitForJob(body.jobId);
    return parseTranscript(body);
  }

  private async waitForJob(jobId: string): Promise<TranscriptResult | null> {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = await this.fetcher(`https://api.supadata.ai/v1/transcript/${encodeURIComponent(jobId)}`, {
        headers: { "x-api-key": this.apiKey },
      });
      if (response.status === 206 || response.status === 404) return null;
      if (!response.ok) throw new Error(`Supadata transcript job failed (${response.status})`);
      const body = await response.json() as SupadataResponse;
      if (body.status === "failed") throw new Error("Supadata transcript job failed");
      if (body.status === "queued" || body.status === "active") continue;
      return parseTranscript(body);
    }
    throw new Error("Supadata transcript job timed out");
  }
}

function parseTranscript(body: SupadataResponse): TranscriptResult | null {
  if (!Array.isArray(body.content) || !body.content.length) return null;
  const chunks = (body.content as SupadataChunk[]).flatMap((chunk) => {
    if (typeof chunk.text !== "string") return [];
    return [{
      text: chunk.text,
      offsetMs: typeof chunk.offset === "number" ? chunk.offset : 0,
      durationMs: typeof chunk.duration === "number" ? chunk.duration : 0,
    }];
  });
  if (!chunks.length) return null;
  return { chunks, language: typeof body.lang === "string" ? body.lang : "unknown" };
}
