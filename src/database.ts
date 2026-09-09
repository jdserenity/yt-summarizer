import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Channel, ChannelMetadata, ChannelRules, SummaryResult, TranscriptResult, Video, VideoMetadata, VideoStatus } from "./types.js";

type Row = Record<string, unknown>;

export class AppDatabase {
  private readonly database: BetterSqlite3.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new BetterSqlite3(path);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void { this.database.close(); }

  addChannel(metadata: ChannelMetadata): Channel {
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO channels (youtube_channel_id, title, handle, added_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(youtube_channel_id) DO UPDATE SET title = excluded.title, handle = excluded.handle, active = 1, updated_at = excluded.updated_at
    `).run(metadata.youtubeChannelId, metadata.title, metadata.handle, now, now, now);
    return this.getChannelByYoutubeId(metadata.youtubeChannelId)!;
  }

  getChannel(id: number): Channel | null {
    return mapChannel(this.database.prepare("SELECT * FROM channels WHERE id = ?").get(id) as Row | undefined);
  }

  getChannelByYoutubeId(youtubeChannelId: string): Channel | null {
    return mapChannel(this.database.prepare("SELECT * FROM channels WHERE youtube_channel_id = ?").get(youtubeChannelId) as Row | undefined);
  }

  listChannels(): Channel[] {
    return (this.database.prepare("SELECT * FROM channels ORDER BY title COLLATE NOCASE").all() as Row[]).map((row) => mapChannel(row)!);
  }

  updateChannelRules(id: number, rules: ChannelRules): void {
    this.database.prepare(`
      UPDATE channels SET include_keywords_json = ?, exclude_keywords_json = ?, min_duration_seconds = ?, max_duration_seconds = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(rules.includeKeywords), JSON.stringify(rules.excludeKeywords), rules.minDurationSeconds, rules.maxDurationSeconds, new Date().toISOString(), id);
  }

  setChannelActive(id: number, active: boolean): void {
    this.database.prepare("UPDATE channels SET active = ?, updated_at = ? WHERE id = ?").run(active ? 1 : 0, new Date().toISOString(), id);
  }

  deleteChannel(id: number): void { this.database.prepare("DELETE FROM channels WHERE id = ?").run(id); }

  updateChannelSync(id: number, checkedAt: string): void {
    this.database.prepare("UPDATE channels SET last_checked_at = ?, updated_at = ? WHERE id = ?").run(checkedAt, checkedAt, id);
  }

  updateWebsubLease(id: number, expiresAt: string): void {
    this.database.prepare("UPDATE channels SET websub_lease_expires_at = ?, updated_at = ? WHERE id = ?").run(expiresAt, new Date().toISOString(), id);
  }

  insertVideo(channelId: number, metadata: VideoMetadata, status: VideoStatus, reason: string | null, nextAttemptAt: string | null = null): boolean {
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO videos (
        youtube_video_id, channel_id, title, description, published_at, duration_seconds, captions_available,
        thumbnail_url, status, skip_reason, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(metadata.videoId, channelId, metadata.title, metadata.description, metadata.publishedAt, metadata.durationSeconds,
      metadata.captionsAvailable ? 1 : 0, metadata.thumbnailUrl, status, reason, nextAttemptAt, now, now);
    return result.changes > 0;
  }

  getVideo(id: number): Video | null {
    return mapVideo(this.database.prepare(`SELECT videos.*, channels.title AS channel_title FROM videos JOIN channels ON channels.id = videos.channel_id WHERE videos.id = ?`).get(id) as Row | undefined);
  }

  getVideoByYoutubeId(youtubeVideoId: string): Video | null {
    return mapVideo(this.database.prepare(`SELECT videos.*, channels.title AS channel_title FROM videos JOIN channels ON channels.id = videos.channel_id WHERE youtube_video_id = ?`).get(youtubeVideoId) as Row | undefined);
  }

  listVideos(limit = 100): Video[] {
    return (this.database.prepare(`
      SELECT videos.*, channels.title AS channel_title FROM videos JOIN channels ON channels.id = videos.channel_id
      ORDER BY published_at DESC LIMIT ?
    `).all(limit) as Row[]).map((row) => mapVideo(row)!);
  }

  claimNextVideo(now: string): Video | null {
    return this.database.transaction(() => {
      const row = this.database.prepare(`
        SELECT videos.*, channels.title AS channel_title FROM videos JOIN channels ON channels.id = videos.channel_id
        WHERE videos.status IN ('queued', 'waiting_captions') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY published_at ASC LIMIT 1
      `).get(now) as Row | undefined;
      if (!row) return null;
      this.database.prepare("UPDATE videos SET status = 'processing', updated_at = ? WHERE id = ?").run(now, row.id);
      return mapVideo({ ...row, status: "processing", updated_at: now });
    })();
  }

  updateVideoMetadata(id: number, metadata: VideoMetadata): void {
    this.database.prepare(`
      UPDATE videos SET title = ?, description = ?, published_at = ?, duration_seconds = ?, captions_available = ?, thumbnail_url = ?, updated_at = ? WHERE id = ?
    `).run(metadata.title, metadata.description, metadata.publishedAt, metadata.durationSeconds, metadata.captionsAvailable ? 1 : 0,
      metadata.thumbnailUrl, new Date().toISOString(), id);
  }

  storeTranscript(id: number, transcript: TranscriptResult): void {
    this.database.prepare("UPDATE videos SET transcript_language = ?, transcript_json = ?, updated_at = ? WHERE id = ?")
      .run(transcript.language, JSON.stringify(transcript.chunks), new Date().toISOString(), id);
  }

  completeVideo(id: number, result: SummaryResult, provider: string, model: string): void {
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE videos SET status = 'ready', skip_reason = NULL, error_message = NULL, next_attempt_at = NULL,
        summary_provider = ?, summary_model = ?, summary_input_tokens = ?, summary_output_tokens = ?, summary_reasoning_tokens = ?,
        article_title = ?, article_dek = ?, article_markdown = ?, key_learnings_json = ?, watch_segments_json = ?, updated_at = ?
      WHERE id = ?
    `).run(provider, model, result.usage.inputTokens, result.usage.outputTokens, result.usage.reasoningTokens,
      result.title, result.dek, result.articleMarkdown, JSON.stringify(result.keyLearnings), JSON.stringify(result.watchSegments), now, id);
  }

  markSkipped(id: number, reason: string): void {
    this.database.prepare(`UPDATE videos SET status = 'skipped', skip_reason = ?, error_message = NULL, next_attempt_at = NULL, updated_at = ? WHERE id = ?`)
      .run(reason, new Date().toISOString(), id);
  }

  rescheduleVideo(id: number, status: "queued" | "waiting_captions", nextAttemptAt: string, message: string | null): void {
    this.database.prepare(`
      UPDATE videos SET status = ?, next_attempt_at = ?, error_message = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE id = ?
    `).run(status, nextAttemptAt, message, new Date().toISOString(), id);
  }

  markFailed(id: number, message: string): void {
    this.database.prepare(`UPDATE videos SET status = 'failed', error_message = ?, next_attempt_at = NULL, attempt_count = attempt_count + 1, updated_at = ? WHERE id = ?`)
      .run(message, new Date().toISOString(), id);
  }

  retryVideo(id: number): void {
    this.database.prepare(`UPDATE videos SET status = 'queued', error_message = NULL, skip_reason = NULL, next_attempt_at = NULL, attempt_count = 0, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  }

  markRead(id: number, read: boolean): void {
    this.database.prepare("UPDATE videos SET read_at = ?, updated_at = ? WHERE id = ?").run(read ? new Date().toISOString() : null, new Date().toISOString(), id);
  }

  resetInterruptedWork(): void {
    this.database.prepare(`UPDATE videos SET status = 'queued', error_message = 'Processing was interrupted; retrying', next_attempt_at = NULL WHERE status = 'processing'`).run();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        youtube_channel_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        handle TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        include_keywords_json TEXT NOT NULL DEFAULT '[]',
        exclude_keywords_json TEXT NOT NULL DEFAULT '[]',
        min_duration_seconds INTEGER,
        max_duration_seconds INTEGER,
        added_at TEXT NOT NULL,
        last_checked_at TEXT,
        websub_lease_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        youtube_video_id TEXT NOT NULL UNIQUE,
        channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        captions_available INTEGER NOT NULL DEFAULT 0,
        thumbnail_url TEXT,
        status TEXT NOT NULL,
        skip_reason TEXT,
        error_message TEXT,
        next_attempt_at TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        transcript_language TEXT,
        transcript_json TEXT,
        summary_provider TEXT,
        summary_model TEXT,
        summary_input_tokens INTEGER,
        summary_output_tokens INTEGER,
        summary_reasoning_tokens INTEGER,
        article_title TEXT,
        article_dek TEXT,
        article_markdown TEXT,
        key_learnings_json TEXT,
        watch_segments_json TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS videos_status_attempt_idx ON videos(status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS videos_channel_published_idx ON videos(channel_id, published_at DESC);
    `);
  }
}

function mapChannel(row: Row | undefined): Channel | null {
  if (!row) return null;
  return {
    id: row.id as number,
    youtubeChannelId: row.youtube_channel_id as string,
    title: row.title as string,
    handle: row.handle as string | null,
    active: Boolean(row.active),
    includeKeywords: parseStringArray(row.include_keywords_json),
    excludeKeywords: parseStringArray(row.exclude_keywords_json),
    minDurationSeconds: row.min_duration_seconds as number | null,
    maxDurationSeconds: row.max_duration_seconds as number | null,
    addedAt: row.added_at as string,
    lastCheckedAt: row.last_checked_at as string | null,
    websubLeaseExpiresAt: row.websub_lease_expires_at as string | null,
  };
}

function mapVideo(row: Row | undefined): Video | null {
  if (!row) return null;
  return {
    id: row.id as number,
    youtubeVideoId: row.youtube_video_id as string,
    channelId: row.channel_id as number,
    channelTitle: row.channel_title as string | undefined,
    title: row.title as string,
    description: row.description as string,
    publishedAt: row.published_at as string,
    durationSeconds: row.duration_seconds as number,
    captionsAvailable: Boolean(row.captions_available),
    thumbnailUrl: row.thumbnail_url as string | null,
    status: row.status as VideoStatus,
    skipReason: row.skip_reason as string | null,
    errorMessage: row.error_message as string | null,
    nextAttemptAt: row.next_attempt_at as string | null,
    attemptCount: row.attempt_count as number,
    transcriptLanguage: row.transcript_language as string | null,
    transcriptJson: row.transcript_json as string | null,
    summaryProvider: row.summary_provider as string | null,
    summaryModel: row.summary_model as string | null,
    summaryInputTokens: row.summary_input_tokens as number | null,
    summaryOutputTokens: row.summary_output_tokens as number | null,
    summaryReasoningTokens: row.summary_reasoning_tokens as number | null,
    articleTitle: row.article_title as string | null,
    articleDek: row.article_dek as string | null,
    articleMarkdown: row.article_markdown as string | null,
    keyLearningsJson: row.key_learnings_json as string | null,
    watchSegmentsJson: row.watch_segments_json as string | null,
    readAt: row.read_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(typeof value === "string" ? value : "[]") as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch { return []; }
}
