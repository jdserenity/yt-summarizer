import type { Channel, Video, WatchSegment } from "./types.js";

export function homePage(videos: Video[], notice = ""): string {
  const readyCount = videos.filter((video) => video.status === "ready" && !video.readAt).length;
  const content = `
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
    <section class="hero"><div><h1>Your video reading list</h1><p class="lede">New uploads become focused articles, without changing your YouTube subscriptions or recommendations.</p></div><a class="button" href="/channels">Manage channels</a></section>
    ${readyCount ? `<p class="muted">${readyCount} unread ${readyCount === 1 ? "article" : "articles"}</p>` : ""}
    ${videos.length ? `<div class="stack">${videos.map(videoCard).join("")}</div>` : `<div class="empty"><h2>Nothing here yet</h2><p>Add a channel and future matching uploads will appear here.</p></div>`}
  `;
  return layout("Reading list", content, "home");
}

export function channelsPage(channels: Channel[], notice = "", error = ""): string {
  const cards = channels.map((channel) => `
    <article class="card">
      <div class="channel-head"><div><h3>${escapeHtml(channel.title)}</h3><div class="muted">${escapeHtml(channel.handle ?? channel.youtubeChannelId)}</div></div><span class="pill ${channel.active ? "ready" : ""}">${channel.active ? "Active" : "Paused"}</span></div>
      <p class="rules">${rulesSummary(channel)}</p>
      <div class="actions"><a class="button secondary" href="/channels/${channel.id}">Edit filters</a><form method="post" action="/channels/${channel.id}/sync"><button class="secondary" type="submit">Check now</button></form></div>
    </article>`).join("");
  return layout("Channels", `
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}${error ? `<div class="notice error">${escapeHtml(error)}</div>` : ""}
    <section class="hero"><div><h1>Channels</h1><p class="lede">Follow channels inside this app only. YouTube account subscriptions are never touched.</p></div></section>
    <form class="card stack" method="post" action="/channels">
      <label>Channel URL, @handle, or ID<input name="channel" placeholder="https://youtube.com/@creator" required></label>
      <div><button type="submit">Add channel</button></div>
    </form>
    <div style="height:20px"></div>
    ${channels.length ? `<div class="grid">${cards}</div>` : `<div class="empty">No channels added yet.</div>`}
  `, "channels");
}

export function channelPage(channel: Channel, error = ""): string {
  return layout(`Edit ${channel.title}`, `
    ${error ? `<div class="notice error">${escapeHtml(error)}</div>` : ""}
    <section class="hero"><div><a class="muted" href="/channels">← Channels</a><h1>${escapeHtml(channel.title)}</h1><p class="lede">Every rule here applies only to this channel.</p></div></section>
    <form class="card stack" method="post" action="/channels/${channel.id}">
      <label>Required title keywords <span class="hint">Optional. If entered, a title must contain at least one. Separate with commas or new lines.</span><textarea name="includeKeywords">${escapeHtml(channel.includeKeywords.join("\n"))}</textarea></label>
      <label>Excluded title keywords <span class="hint">A title containing any of these is skipped before transcript charges.</span><textarea name="excludeKeywords">${escapeHtml(channel.excludeKeywords.join("\n"))}</textarea></label>
      <div class="row">
        <label>Minimum length in minutes <span class="hint">Leave blank for no minimum.</span><input type="number" min="0" step="1" name="minMinutes" value="${secondsToMinutes(channel.minDurationSeconds)}"></label>
        <label>Maximum length in minutes <span class="hint">Leave blank for no maximum.</span><input type="number" min="1" step="1" name="maxMinutes" value="${secondsToMinutes(channel.maxDurationSeconds)}"></label>
      </div>
      <label style="display:flex;grid-template-columns:auto 1fr;align-items:center"><input style="width:auto" type="checkbox" name="active" ${channel.active ? "checked" : ""}> Process new videos from this channel</label>
      <div class="actions"><button type="submit">Save filters</button><a class="button secondary" href="/channels">Cancel</a></div>
    </form>
    <div style="height:20px"></div>
    <form method="post" action="/channels/${channel.id}/delete" onsubmit="return confirm('Remove this channel and all its saved articles?')"><button class="danger" type="submit">Remove channel</button></form>
  `, "channels");
}

export function articlePage(video: Video, articleHtml: string): string {
  const learnings = parseStringArray(video.keyLearningsJson);
  const segments = parseWatchSegments(video.watchSegmentsJson);
  return layout(video.articleTitle ?? video.title, `
    <article class="article">
      <header class="article-header"><a class="muted" href="/">← Reading list</a><div class="meta"><span>${escapeHtml(video.channelTitle ?? "")}</span><span>${formatDuration(video.durationSeconds)}</span><a href="https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeVideoId)}" target="_blank" rel="noreferrer">Watch on YouTube ↗</a></div><h1>${escapeHtml(video.articleTitle ?? video.title)}</h1>${video.articleDek ? `<p class="lede">${escapeHtml(video.articleDek)}</p>` : ""}</header>
      ${learnings.length ? `<aside class="card detail-panel"><h2>Key learnings</h2><ul class="learning-list">${learnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></aside>` : ""}
      <div class="article-body">${articleHtml}</div>
      ${segments.length ? `<aside class="card detail-panel"><h2>Worth watching</h2><ul class="learning-list">${segments.map((segment) => `<li><a href="https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeVideoId)}&t=${Math.floor(segment.startSeconds)}s" target="_blank" rel="noreferrer">${formatDuration(segment.startSeconds)}</a> — ${escapeHtml(segment.reason)}</li>`).join("")}</ul></aside>` : ""}
      <div class="meta"><span>Generated by ${escapeHtml(video.summaryModel ?? "configured model")}</span>${video.summaryInputTokens ? `<span>${video.summaryInputTokens.toLocaleString()} input tokens</span>` : ""}</div>
      <form style="margin-top:24px" method="post" action="/articles/${video.id}/read"><input type="hidden" name="read" value="${video.readAt ? "false" : "true"}"><button class="secondary" type="submit">Mark ${video.readAt ? "unread" : "read"}</button></form>
    </article>
  `, "home");
}

function videoCard(video: Video): string {
  const title = video.articleTitle ?? video.title;
  const body = video.status === "ready" ? escapeHtml(video.articleDek ?? "Article ready to read.") : escapeHtml(video.skipReason ?? video.errorMessage ?? statusDescription(video.status));
  const inner = `<article class="card video-card">${video.thumbnailUrl ? `<img src="${escapeAttribute(video.thumbnailUrl)}" alt="">` : ""}<div><div class="actions"><span class="pill ${video.status}">${escapeHtml(video.status.replace("_", " "))}</span>${video.readAt ? `<span class="pill">Read</span>` : ""}</div><${video.status === "ready" ? "a href=\"/articles/" + video.id + "\"" : "div"} class="card-title">${escapeHtml(title)}</${video.status === "ready" ? "a" : "div"}><p class="muted">${body}</p><div class="meta"><span>${escapeHtml(video.channelTitle ?? "")}</span><span>${formatDuration(video.durationSeconds)}</span><span>${formatDate(video.publishedAt)}</span></div>${video.status === "failed" ? `<form style="margin-top:12px" method="post" action="/videos/${video.id}/retry"><button class="secondary" type="submit">Retry</button></form>` : ""}</div></article>`;
  return inner;
}

function layout(title: string, content: string, active: "home" | "channels"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)} · Distilled</title><link rel="stylesheet" href="/styles.css"></head><body><header class="topbar"><div class="shell"><a class="brand" href="/">Distilled</a><nav><a class="${active === "home" ? "active" : ""}" href="/">Reading list</a><a class="${active === "channels" ? "active" : ""}" href="/channels">Channels</a></nav></div></header><main class="shell">${content}</main></body></html>`;
}

function rulesSummary(channel: Channel): string {
  const parts: string[] = [];
  if (channel.includeKeywords.length) parts.push(`requires: ${channel.includeKeywords.join(", ")}`);
  if (channel.excludeKeywords.length) parts.push(`excludes: ${channel.excludeKeywords.join(", ")}`);
  if (channel.minDurationSeconds !== null) parts.push(`minimum ${formatDuration(channel.minDurationSeconds)}`);
  if (channel.maxDurationSeconds !== null) parts.push(`maximum ${formatDuration(channel.maxDurationSeconds)}`);
  return escapeHtml(parts.length ? parts.join(" · ") : "All new video titles and lengths are accepted.");
}

function statusDescription(status: Video["status"]): string {
  return ({ queued: "Waiting to be processed.", waiting_captions: "Waiting for YouTube captions.", processing: "Creating the article.", ready: "Article ready.", skipped: "Skipped.", failed: "Processing failed." })[status];
}

function secondsToMinutes(seconds: number | null): string { return seconds === null ? "" : String(seconds / 60); }
function formatDuration(seconds: number): string { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`; }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }); }
function parseStringArray(value: string | null): string[] { try { const parsed = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
function parseWatchSegments(value: string | null): WatchSegment[] { try { const parsed = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is WatchSegment => typeof item?.startSeconds === "number" && typeof item?.reason === "string") : []; } catch { return []; } }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function escapeAttribute(value: string): string { return escapeHtml(value); }
