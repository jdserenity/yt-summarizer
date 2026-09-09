import { describe, expect, it, vi } from "vitest";
import { ResponsesSummarizer } from "../src/summarizers.js";

const article = {
  title: "A useful title",
  dek: "The central idea in one sentence.",
  articleMarkdown: "## Main idea\n\nUseful detail.",
  keyLearnings: ["One useful detail"],
  watchSegments: [{ startSeconds: 90, reason: "Visual demonstration" }],
};

describe("ResponsesSummarizer", () => {
  it.each([
    ["openai", "https://api.openai.com/v1", "openai-key", "gpt-5.6-terra", "none"],
    ["xai", "https://api.x.ai/v1", "xai-key", "grok-4.6", "low"],
  ] as const)("supports the %s provider", async (_provider, baseUrl, apiKey, model, effort) => {
    const fetcher = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(article) }] }],
      usage: { input_tokens: 5000, output_tokens: 1500, output_tokens_details: { reasoning_tokens: 100 } },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const summarizer = new ResponsesSummarizer({ baseUrl, apiKey, model, reasoningEffort: effort }, fetcher);

    const result = await summarizer.summarize({
      videoTitle: "Original title",
      channelTitle: "Creator",
      durationSeconds: 1800,
      transcript: [{ text: "Useful point", offsetMs: 1000, durationMs: 500 }],
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/responses`);
    const request = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(request.model).toBe(model);
    expect(request.reasoning).toEqual({ effort });
    expect(request.text.format.type).toBe("json_schema");
    expect(result).toEqual({ ...article, usage: { inputTokens: 5000, outputTokens: 1500, reasoningTokens: 100 } });
  });
});
