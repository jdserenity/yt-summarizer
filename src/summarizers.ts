import type { SummaryInput, SummaryProvider, SummaryResult, WatchSegment } from "./types.js";

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ResponsesSummarizerConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: string;
  provider?: string;
}

const summarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    dek: { type: "string" },
    articleMarkdown: { type: "string" },
    keyLearnings: { type: "array", items: { type: "string" } },
    watchSegments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { startSeconds: { type: "number" }, reason: { type: "string" } },
        required: ["startSeconds", "reason"],
      },
    },
  },
  required: ["title", "dek", "articleMarkdown", "keyLearnings", "watchSegments"],
};

const instructions = `Turn the supplied YouTube transcript into a concise, standalone article for a thoughtful reader.
Preserve important arguments, evidence, examples, procedures, numbers, disagreements, caveats, and novel insights.
Remove sponsorships, introductions, calls to action, banter, repetition, rhetorical padding, and restatements.
Let information density determine length rather than video duration. Do not invent facts or use outside knowledge.
Use clear Markdown headings and prose. Key learnings should be concrete, not generic.
Only recommend watch segments when visuals, a demonstration, or delivery genuinely matters. Use transcript timestamps.`;

export class ResponsesSummarizer implements SummaryProvider {
  readonly provider: string;
  readonly model: string;

  constructor(private readonly config: ResponsesSummarizerConfig, private readonly fetcher: Fetcher = fetch) {
    this.provider = config.provider ?? (config.baseUrl.includes("x.ai") ? "xai" : "openai");
    this.model = config.model;
  }

  async summarize(input: SummaryInput): Promise<SummaryResult> {
    const transcript = input.transcript.map((chunk) => `[${formatTimestamp(Math.floor(chunk.offsetMs / 1000))}] ${chunk.text}`).join("\n");
    const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        reasoning: { effort: this.config.reasoningEffort },
        instructions,
        input: `Channel: ${input.channelTitle}\nVideo title: ${input.videoTitle}\nDuration: ${formatTimestamp(input.durationSeconds)}\n\nTranscript:\n${transcript}`,
        text: { format: { type: "json_schema", name: "video_article", strict: true, schema: summarySchema } },
      }),
    });
    if (!response.ok) throw new Error(`${this.provider} summary request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const body = await response.json() as Record<string, unknown>;
    const parsed = parseSummary(extractOutputText(body));
    const usage = (body.usage ?? {}) as Record<string, unknown>;
    const details = (usage.output_tokens_details ?? {}) as Record<string, unknown>;
    return {
      ...parsed,
      usage: {
        inputTokens: numberOrZero(usage.input_tokens),
        outputTokens: numberOrZero(usage.output_tokens),
        reasoningTokens: numberOrZero(details.reasoning_tokens),
      },
    };
  }
}

function extractOutputText(body: Record<string, unknown>): string {
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) throw new Error("Summary provider returned no output");
  for (const item of body.output as Array<Record<string, unknown>>) {
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (typeof content.text === "string") return content.text;
    }
  }
  throw new Error("Summary provider returned no text output");
}

function parseSummary(value: string): Omit<SummaryResult, "usage"> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error("Summary provider returned invalid JSON");
  }
  if (typeof body.title !== "string" || typeof body.dek !== "string" || typeof body.articleMarkdown !== "string") {
    throw new Error("Summary provider returned an incomplete article");
  }
  if (!Array.isArray(body.keyLearnings) || !body.keyLearnings.every((item) => typeof item === "string")) {
    throw new Error("Summary provider returned invalid key learnings");
  }
  if (!Array.isArray(body.watchSegments)) throw new Error("Summary provider returned invalid watch segments");
  const watchSegments: WatchSegment[] = body.watchSegments.map((item) => {
    const segment = item as Record<string, unknown>;
    if (typeof segment.startSeconds !== "number" || typeof segment.reason !== "string") throw new Error("Summary provider returned an invalid watch segment");
    return { startSeconds: segment.startSeconds, reason: segment.reason };
  });
  return { title: body.title, dek: body.dek, articleMarkdown: body.articleMarkdown, keyLearnings: body.keyLearnings, watchSegments };
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.floor(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
