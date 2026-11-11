#!/usr/bin/env node
// Import past Claude Code sessions into TimeTrack as billable agent time.
//
// Reads ~/.claude/projects/**/*.jsonl locally and sends ONLY, per session:
// its id, working directory, git branch/remote, activity timestamps
// (compressed into spans) and token counts per model. Never sends prompts,
// messages, tool calls or file contents.
//
//   TIMETRACK_API_KEY=tt_... node import-transcripts.mjs [--days 30] [--dry-run]
//
// Zero dependencies (Node 18+). Safe to re-run: sessions are keyed by id,
// earlier imports are replaced and live-tracked sessions are left alone.
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const API = (process.env.TIMETRACK_API_URL || "https://api.track.alfredo.re").replace(/\/$/, "");
const KEY = process.env.TIMETRACK_API_KEY;
const DAYS = Number(opt("days", "30"));
const DRY_RUN = flag("dry-run");
const ROOT = opt("dir", join(homedir(), ".claude", "projects"));
const SPAN_GAP_MS = 60_000; // compress activity closer than this into one span
const MAX_SPANS = 10_000; // the server's per-session limit
const BATCH = 50;
// Stay under nginx's default 1 MB body limit in front of the API.
const MAX_BODY_BYTES = 800_000;
// Written only after a complete, successful import (the plugin's first-run marker).
const MARK = opt("mark");

if (!KEY) {
  console.error("Set TIMETRACK_API_KEY (Settings → API keys in TimeTrack).");
  process.exit(1);
}
if (!existsSync(ROOT)) {
  console.error(`No Claude Code transcripts found at ${ROOT}`);
  process.exit(1);
}

const since = Date.now() - DAYS * 86400_000;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) yield* walk(p);
    else if (name.endsWith(".jsonl") && s.mtimeMs >= since) yield p;
  }
}

const ACTIVITY_TYPES = new Set(["user", "assistant"]);
const sessions = new Map();

for (const file of walk(ROOT)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const line of text.split("\n")) {
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!o.sessionId || !o.timestamp || !ACTIVITY_TYPES.has(o.type)) continue;
    const t = Date.parse(o.timestamp);
    if (!t || t < since) continue;
    let s = sessions.get(o.sessionId);
    if (!s) {
      s = { times: [], cwd: null, gitBranch: null, usage: {}, seen: new Set() };
      sessions.set(o.sessionId, s);
    }
    s.times.push(t);
    if (!s.cwd && o.cwd) s.cwd = o.cwd;
    if (o.gitBranch) s.gitBranch = o.gitBranch;
    const m = o.message;
    if (o.type === "assistant" && m && m.model && m.usage) {
      // A streamed message is written once per content block; count it once.
      const dedupe = `${m.id || ""}:${o.requestId || ""}`;
      if (s.seen.has(dedupe)) continue;
      s.seen.add(dedupe);
      const u = (s.usage[m.model] ||= { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
      u.inputTokens += m.usage.input_tokens || 0;
      u.outputTokens += m.usage.output_tokens || 0;
      u.cacheReadTokens += m.usage.cache_read_input_tokens || 0;
      u.cacheWriteTokens += m.usage.cache_creation_input_tokens || 0;
    }
  }
}

const remotes = new Map();
const remoteFor = (cwd) => {
  if (!cwd) return null;
  if (remotes.has(cwd)) return remotes.get(cwd);
  let r = null;
  try {
    if (existsSync(cwd)) {
      r = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || null;
    }
  } catch {
    r = null;
  }
  remotes.set(cwd, r);
  return r;
};

const toSpans = (times, gap = SPAN_GAP_MS) => {
  const sorted = [...times].sort((a, b) => a - b);
  const spans = [];
  for (const t of sorted) {
    const last = spans[spans.length - 1];
    if (last && t - last[1] <= gap) last[1] = t;
    else spans.push([t, t]);
  }
  return spans;
};

/**
 * Spans for one session, within the server's limit. Very long sessions get
 * a wider merge gap (still below the server's idle gap, so no billed time
 * changes) instead of being truncated.
 */
const fitSpans = (times) => {
  let spans = toSpans(times);
  for (const gap of [120_000, 300_000]) {
    if (spans.length <= MAX_SPANS) break;
    spans = toSpans(times, gap);
  }
  if (spans.length > MAX_SPANS) {
    console.error(`  note: one very long session was trimmed to its first ${MAX_SPANS} activity spans`);
    spans = spans.slice(0, MAX_SPANS);
  }
  return spans.map(([a, b]) => [new Date(a).toISOString(), new Date(b).toISOString()]);
};

const payload = [];
for (const [sessionKey, s] of sessions) {
  if (s.times.length < 2) continue;
  payload.push({
    sessionKey,
    agent: "claude_code",
    cwd: s.cwd,
    gitBranch: s.gitBranch,
    gitRemote: remoteFor(s.cwd),
    spans: fitSpans(s.times),
    usage: Object.keys(s.usage).length ? s.usage : undefined,
  });
}

if (payload.length === 0) {
  console.log(`No Claude Code sessions in the last ${DAYS} days.`);
  process.exit(0);
}

const hm = (sec) => `${Math.floor(sec / 3600)}h ${String(Math.round((sec % 3600) / 60)).padStart(2, "0")}m`;
let tracked = 0;
let imported = 0;
let skipped = 0;
let updated = 0;
const byProject = new Map();
let limited = null;

// Batches of at most BATCH sessions and MAX_BODY_BYTES of JSON.
const batches = [];
let current = [];
let size = 0;
for (const session of payload) {
  const bytes = Buffer.byteLength(JSON.stringify(session)) + 1;
  if (current.length > 0 && (current.length >= BATCH || size + bytes > MAX_BODY_BYTES)) {
    batches.push(current);
    current = [];
    size = 0;
  }
  current.push(session);
  size += bytes;
}
if (current.length > 0) batches.push(current);

const skippedBy = new Map();
for (const batch of batches) {
  let res;
  try {
    res = await fetch(`${API}/agent-sessions/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Client": "import" },
      body: JSON.stringify({ dryRun: DRY_RUN, sessions: batch }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    console.error(`Couldn't reach TimeTrack at ${API}: ${e?.cause?.code || e?.message || e}`);
    process.exit(1);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`TimeTrack refused the import (${res.status}): ${body.error || "unknown error"}`);
    // No marker: the plugin retries on a later session start.
    process.exit(1);
  }
  tracked += body.totals.trackedSeconds;
  imported += body.totals.sessions;
  skipped += body.totals.skipped;
  for (const r of body.sessions ?? []) {
    if (r.status === "replaced") updated += 1;
    else if (r.status !== "imported") skippedBy.set(r.status, (skippedBy.get(r.status) || 0) + 1);
  }
  limited ||= body.limitedByPlan;
  for (const row of body.totals.byProject) {
    const name = row.project?.name ?? "No project yet";
    byProject.set(name, (byProject.get(name) || 0) + row.seconds);
  }
}

const fresh = imported - updated;
const counts = updated ? `${fresh} new and ${updated} earlier-imported` : `${imported}`;
console.log(`${DRY_RUN ? "Would import" : "Imported"} ${counts} Claude Code sessions — ${hm(tracked)} of agent time (last ${DAYS} days)`);
for (const [name, sec] of [...byProject].sort((a, b) => b[1] - a[1])) console.log(`  ${hm(sec).padStart(8)}  ${name}`);
const SKIP_LABELS = {
  skipped_live: "tracked live",
  skipped_edited: "edited in TimeTrack since the last import",
  empty: "too short to bill",
  invalid: "unreadable",
};
if (skipped) {
  const parts = [...skippedBy].map(([status, n]) => `${n} ${SKIP_LABELS[status] ?? status}`);
  console.log(`  (${skipped} skipped: ${parts.join(", ")})`);
}
if (limited) console.log(`  Free plan: only the last ${limited.historyDays} days were included.`);
if (byProject.has("No project yet")) {
  console.log("  Tip: link a repo to a project in TimeTrack and re-run to assign those sessions.");
}
if (DRY_RUN) console.log("Nothing was written. Run again without --dry-run to import.");
else if (MARK) writeFileSync(MARK, new Date().toISOString() + "\n");
