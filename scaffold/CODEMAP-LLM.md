# Code map (agent reference)

Dense codebase/system map for agents — compact is fine. Optimized so an agent can understand the system without grepping the whole codebase.

Confirmed product and system facts only. No open questions. Lessons and pitfalls belong here as short factual notes, or in scaffold/CODEMAP-HUMAN.md when they are mainly a maintainer-facing map note.

## Product constraints

- Personal web app deployed on the user's VPS.
- Transcript acquisition must not fall back to audio transcription such as Whisper.
- Followed channels are maintained independently inside the app; it must not subscribe through the user's YouTube account or affect YouTube recommendations.
- Each followed channel owns its title keyword and minimum/maximum video-duration filters; no filters are global. Rejected videos are skipped before paid transcript or summarization calls.
- Do not use Next.js or Docker.
- Deployment follows the existing VPS model: application on one localhost port, managed by systemd, proxied through nginx, and reached through Cloudflare Tunnel.

## Implemented system

- Fastify and TypeScript serve server-rendered HTML from one Node process; SQLite is the only datastore.
- YouTube WebSub provides prompt upload notifications, while periodic channel-feed reconciliation catches missed notifications. The YouTube Data API supplies channel and video metadata before paid processing.
- Supadata is called only in native-caption mode. Missing captions are retried within bounded limits; audio transcription is never attempted.
- Summarization uses a provider-neutral Responses API adapter selected by environment variables. xAI Grok 4.6 with low reasoning is the default, and OpenAI-compatible model selection is configuration-only.
- SQLite stores channels, discovered videos, generated articles, WebSub renewal state, job attempts, and retry scheduling. Processing jobs resume safely after restarts.
