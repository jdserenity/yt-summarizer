import { AppDatabase } from "./database.js";
import { evaluateVideo } from "./filters.js";
import type { SummaryProvider, TranscriptProvider, VideoMetadata } from "./types.js";

interface YouTubeVideoClient {
  getVideo(videoId: string): Promise<VideoMetadata>;
}

const captionRetryMinutes = 30;
const maxAttempts = 6;

export class VideoProcessor {
  constructor(
    private readonly database: AppDatabase,
    private readonly youtube: YouTubeVideoClient,
    private readonly transcripts: TranscriptProvider,
    private readonly summaries: SummaryProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async discover(videoId: string, channelYoutubeId: string): Promise<boolean> {
    const channel = this.database.getChannelByYoutubeId(channelYoutubeId);
    if (!channel?.active || this.database.getVideoByYoutubeId(videoId)) return false;
    const metadata = await this.youtube.getVideo(videoId);
    if (metadata.channelYoutubeId !== channelYoutubeId) throw new Error("YouTube returned a different channel for the discovered video");
    const decision = evaluateVideo(metadata.title, metadata.durationSeconds, channel);
    if (!decision.accepted) return this.database.insertVideo(channel.id, metadata, "skipped", decision.reason);
    if (!metadata.captionsAvailable) {
      return this.database.insertVideo(channel.id, metadata, "waiting_captions", null, addMinutes(this.now(), captionRetryMinutes));
    }
    return this.database.insertVideo(channel.id, metadata, "queued", null);
  }

  async processNext(): Promise<boolean> {
    const video = this.database.claimNextVideo(this.now().toISOString());
    if (!video) return false;
    try {
      const channel = this.database.getChannel(video.channelId);
      if (!channel?.active) { this.database.markSkipped(video.id, "Channel is paused"); return true; }
      let currentVideo = video;
      if (!video.captionsAvailable) {
        const metadata = await this.youtube.getVideo(video.youtubeVideoId);
        this.database.updateVideoMetadata(video.id, metadata);
        const decision = evaluateVideo(metadata.title, metadata.durationSeconds, channel);
        if (!decision.accepted) { this.database.markSkipped(video.id, decision.reason); return true; }
        if (!metadata.captionsAvailable) {
          if (video.attemptCount + 1 >= maxAttempts) this.database.markSkipped(video.id, "Captions did not become available");
          else this.database.rescheduleVideo(video.id, "waiting_captions", addMinutes(this.now(), captionRetryMinutes), null);
          return true;
        }
        currentVideo = { ...video, title: metadata.title, description: metadata.description, durationSeconds: metadata.durationSeconds, captionsAvailable: true };
      } else {
        const decision = evaluateVideo(video.title, video.durationSeconds, channel);
        if (!decision.accepted) { this.database.markSkipped(video.id, decision.reason); return true; }
      }
      const transcript = await this.transcripts.getTranscript(video.youtubeVideoId);
      if (!transcript) {
        if (video.attemptCount + 1 >= 3) this.database.markSkipped(video.id, "Native transcript was unavailable");
        else this.database.rescheduleVideo(video.id, "queued", addMinutes(this.now(), captionRetryMinutes), "Native transcript was not ready");
        return true;
      }
      this.database.storeTranscript(video.id, transcript);
      const summary = await this.summaries.summarize({
        videoTitle: currentVideo.title,
        channelTitle: channel.title,
        durationSeconds: currentVideo.durationSeconds,
        transcript: transcript.chunks,
      });
      this.database.completeVideo(video.id, summary, this.summaries.provider, this.summaries.model);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (video.attemptCount + 1 >= maxAttempts) this.database.markFailed(video.id, message);
      else this.database.rescheduleVideo(video.id, "queued", addMinutes(this.now(), 2 ** video.attemptCount * 5), message);
    }
    return true;
  }
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}
