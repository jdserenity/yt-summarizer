import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { AppDatabase } from "./database.js";
import { VideoProcessor } from "./processor.js";
import { ResponsesSummarizer } from "./summarizers.js";
import { SupadataTranscriptProvider } from "./transcripts.js";
import { YouTubeClient } from "./youtube.js";

const config = loadConfig();
const database = new AppDatabase(config.databasePath);
const youtube = new YouTubeClient(config.youtubeApiKey);
const transcripts = new SupadataTranscriptProvider(config.supadataApiKey);
const summaries = new ResponsesSummarizer({
  baseUrl: config.summaryProvider === "xai" ? "https://api.x.ai/v1" : "https://api.openai.com/v1",
  apiKey: config.summaryApiKey,
  model: config.summaryModel,
  reasoningEffort: config.summaryReasoningEffort,
  provider: config.summaryProvider,
});
const processor = new VideoProcessor(database, youtube, transcripts, summaries);
const app = buildApp({ config, database, youtube, processor });

const shutdown = async () => {
  await app.close(); database.close(); process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error); database.close(); process.exit(1);
}
