export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  publicUrl: string;
  youtubeApiKey: string;
  supadataApiKey: string;
  summaryProvider: "openai" | "xai";
  summaryModel: string;
  summaryReasoningEffort: string;
  summaryApiKey: string;
  appUsername: string;
  appPassword: string;
  websubVerifyToken: string;
  maintenanceIntervalMinutes: number;
  workerIntervalSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const summaryProvider = env.SUMMARY_PROVIDER === "openai" ? "openai" : "xai";
  const summaryApiKey = summaryProvider === "openai" ? env.OPENAI_API_KEY : env.XAI_API_KEY;
  const required = {
    YOUTUBE_API_KEY: env.YOUTUBE_API_KEY,
    SUPADATA_API_KEY: env.SUPADATA_API_KEY,
    [`${summaryProvider.toUpperCase()}_API_KEY`]: summaryApiKey,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  return {
    host: env.HOST || "127.0.0.1",
    port: positiveInteger(env.PORT, 8010),
    databasePath: env.DATABASE_PATH || "./data/youtube-reader.sqlite",
    publicUrl: (env.PUBLIC_URL || "").replace(/\/$/, ""),
    youtubeApiKey: env.YOUTUBE_API_KEY!,
    supadataApiKey: env.SUPADATA_API_KEY!,
    summaryProvider,
    summaryModel: env.SUMMARY_MODEL || (summaryProvider === "xai" ? "grok-4.6" : "gpt-5.6-terra"),
    summaryReasoningEffort: env.SUMMARY_REASONING_EFFORT || (summaryProvider === "xai" ? "low" : "none"),
    summaryApiKey: summaryApiKey!,
    appUsername: env.APP_USERNAME || "reader",
    appPassword: env.APP_PASSWORD || "",
    websubVerifyToken: env.WEBSUB_VERIFY_TOKEN || "",
    maintenanceIntervalMinutes: positiveInteger(env.MAINTENANCE_INTERVAL_MINUTES, 360),
    workerIntervalSeconds: positiveInteger(env.WORKER_INTERVAL_SECONDS, 15),
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
