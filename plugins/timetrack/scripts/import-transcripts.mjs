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
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
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
const BATCH = 50;

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

const toSpans = (times) => {
  const sorted = [...times].sort((a, b) => a - b);
  const spans = [];
  for (const t of sorted) {
    const last = spans[spans.length - 1];
    if (last && t - last[1] <= SPAN_GAP_MS) last[1] = t;
    else spans.push([t, t]);
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
    spans: toSpans(s.times).slice(0, 10_000),
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
const byProject = new Map();
let limited = null;

for (let i = 0; i < payload.length; i += BATCH) {
  const res = await fetch(`${API}/agent-sessions/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Client": "import" },
    body: JSON.stringify({ dryRun: DRY_RUN, sessions: payload.slice(i, i + BATCH) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`TimeTrack refused the import (${res.status}): ${body.error || "unknown error"}`);
    process.exit(1);
  }
  tracked += body.totals.trackedSeconds;
  imported += body.totals.sessions;
  skipped += body.totals.skipped;
  limited ||= body.limitedByPlan;
  for (const row of body.totals.byProject) {
    const name = row.project?.name ?? "No project yet";
    byProject.set(name, (byProject.get(name) || 0) + row.seconds);
  }
}

console.log(`${DRY_RUN ? "Would import" : "Imported"} ${imported} Claude Code sessions — ${hm(tracked)} of agent time (last ${DAYS} days)`);
for (const [name, sec] of [...byProject].sort((a, b) => b[1] - a[1])) console.log(`  ${hm(sec).padStart(8)}  ${name}`);
if (skipped) console.log(`  (${skipped} skipped: already tracked live or empty)`);
if (limited) console.log(`  Free plan: only the last ${limited.historyDays} days were included.`);
if (byProject.has("No project yet")) {
  console.log("  Tip: link a repo to a project in TimeTrack and re-run to assign those sessions.");
}
if (DRY_RUN) console.log("Nothing was written. Run again without --dry-run to import.");
