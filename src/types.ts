export interface ChannelRules {
  includeKeywords: string[];
  excludeKeywords: string[];
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
}

export interface Channel extends ChannelRules {
  id: number;
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  active: boolean;
  addedAt: string;
  lastCheckedAt: string | null;
  websubLeaseExpiresAt: string | null;
}

export type VideoStatus = "queued" | "waiting_captions" | "processing" | "ready" | "skipped" | "failed";

export interface Video {
  id: number;
  youtubeVideoId: string;
  channelId: number;
  channelTitle?: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSeconds: number;
  captionsAvailable: boolean;
  thumbnailUrl: string | null;
  status: VideoStatus;
  skipReason: string | null;
  errorMessage: string | null;
  nextAttemptAt: string | null;
  attemptCount: number;
  transcriptLanguage: string | null;
  transcriptJson: string | null;
  summaryProvider: string | null;
  summaryModel: string | null;
  summaryInputTokens: number | null;
  summaryOutputTokens: number | null;
  summaryReasoningTokens: number | null;
  articleTitle: string | null;
  articleDek: string | null;
  articleMarkdown: string | null;
  keyLearningsJson: string | null;
  watchSegmentsJson: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoMetadata {
  videoId: string;
  channelYoutubeId: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSeconds: number;
  captionsAvailable: boolean;
  thumbnailUrl: string | null;
}

export interface ChannelMetadata {
  youtubeChannelId: string;
  title: string;
  handle: string | null;
}

export interface TranscriptProvider {
  getTranscript(videoId: string): Promise<TranscriptResult | null>;
}

export interface TranscriptChunk {
  text: string;
  offsetMs: number;
  durationMs: number;
}

export interface TranscriptResult {
  chunks: TranscriptChunk[];
  language: string;
}

export interface SummaryInput {
  videoTitle: string;
  channelTitle: string;
  durationSeconds: number;
  transcript: TranscriptChunk[];
}

export interface WatchSegment {
  startSeconds: number;
  reason: string;
}

export interface SummaryUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface SummaryResult {
  title: string;
  dek: string;
  articleMarkdown: string;
  keyLearnings: string[];
  watchSegments: WatchSegment[];
  usage: SummaryUsage;
}

export interface SummaryProvider {
  readonly provider: string;
  readonly model: string;
  summarize(input: SummaryInput): Promise<SummaryResult>;
}
