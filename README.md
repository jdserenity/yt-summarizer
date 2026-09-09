# Distilled

A lightweight personal YouTube reader. It watches an independent channel list, retrieves existing captions, and turns matching uploads into articles.

## Local setup

```sh
cp .env.example .env
npm install
npm test
npm run build
node --env-file=.env dist/server.js
```

Open `http://127.0.0.1:8010`. Required API keys and model selection live in `.env`.

## VPS deployment

Build with `npm ci && npm run build`, then adapt the files in `deploy/` to the existing nginx, Cloudflare Tunnel, and `systemd` setup. The process binds only to `127.0.0.1`.
