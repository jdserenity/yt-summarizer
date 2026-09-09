import { describe, expect, it } from "vitest";
import { evaluateVideo } from "../src/filters.js";
import type { ChannelRules } from "../src/types.js";

const rules: ChannelRules = {
  includeKeywords: [],
  excludeKeywords: [],
  minDurationSeconds: null,
  maxDurationSeconds: null,
};

describe("evaluateVideo", () => {
  it("accepts a video when a channel has no filters", () => {
    expect(evaluateVideo("A useful lecture", 1800, rules)).toEqual({ accepted: true });
  });

  it("rejects excluded title keywords without case sensitivity", () => {
    expect(evaluateVideo("My Weekly LIVESTREAM", 1800, {
      ...rules,
      excludeKeywords: ["livestream", "reaction"],
    })).toEqual({ accepted: false, reason: "Title matched excluded keyword: livestream" });
  });

  it("requires an included keyword when include filters exist", () => {
    expect(evaluateVideo("General channel update", 1800, {
      ...rules,
      includeKeywords: ["tutorial", "analysis"],
    })).toEqual({ accepted: false, reason: "Title did not match any included keyword" });
  });

  it("accepts any matching included keyword", () => {
    expect(evaluateVideo("A careful market analysis", 1800, {
      ...rules,
      includeKeywords: ["tutorial", "analysis"],
    })).toEqual({ accepted: true });
  });

  it("applies the channel's minimum and maximum duration", () => {
    const durationRules = { ...rules, minDurationSeconds: 180, maxDurationSeconds: 3600 };
    expect(evaluateVideo("Short update", 120, durationRules)).toEqual({ accepted: false, reason: "Video is shorter than 3 minutes" });
    expect(evaluateVideo("Very long podcast", 5400, durationRules)).toEqual({ accepted: false, reason: "Video is longer than 60 minutes" });
  });

  it("gives exclusion rules priority over inclusion rules", () => {
    expect(evaluateVideo("Tutorial livestream", 1800, {
      ...rules,
      includeKeywords: ["tutorial"],
      excludeKeywords: ["livestream"],
    })).toEqual({ accepted: false, reason: "Title matched excluded keyword: livestream" });
  });
});
