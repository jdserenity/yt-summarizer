import type { ChannelRules } from "./types.js";

export type FilterResult = { accepted: true } | { accepted: false; reason: string };

function minutes(seconds: number): string {
  return Number.isInteger(seconds / 60) ? String(seconds / 60) : (seconds / 60).toFixed(1);
}

export function normalizeKeywords(value: string | string[]): string[] {
  const values = Array.isArray(value) ? value : value.split(/[\n,]/);
  return [...new Set(values.map((keyword) => keyword.trim()).filter(Boolean))];
}

export function evaluateVideo(title: string, durationSeconds: number, rules: ChannelRules): FilterResult {
  const normalizedTitle = title.toLocaleLowerCase();
  for (const keyword of rules.excludeKeywords) {
    if (normalizedTitle.includes(keyword.toLocaleLowerCase())) {
      return { accepted: false, reason: `Title matched excluded keyword: ${keyword}` };
    }
  }
  if (rules.includeKeywords.length && !rules.includeKeywords.some((keyword) => normalizedTitle.includes(keyword.toLocaleLowerCase()))) {
    return { accepted: false, reason: "Title did not match any included keyword" };
  }
  if (rules.minDurationSeconds !== null && durationSeconds < rules.minDurationSeconds) {
    return { accepted: false, reason: `Video is shorter than ${minutes(rules.minDurationSeconds)} minutes` };
  }
  if (rules.maxDurationSeconds !== null && durationSeconds > rules.maxDurationSeconds) {
    return { accepted: false, reason: `Video is longer than ${minutes(rules.maxDurationSeconds)} minutes` };
  }
  return { accepted: true };
}
