#!/usr/bin/env node
// Import past Claude Code sessions into TimeTrack as billable agent time.
//
// Reads $CLAUDE_CONFIG_DIR/projects/**/*.jsonl (default ~/.claude) locally
// and sends ONLY, per session: its id, working directory, git branch/remote
// (credentials stripped), activity timestamps (compressed into spans) and
// token counts per model. Never sends prompts, messages, tool calls or file
// contents.
//
//   TIMETRACK_API_URL=https://api.track.alfredo.re TIMETRACK_API_KEY=tt_... \
//     node import-transcripts.mjs [--days 30] [--dry-run]
//
// Zero dependencies (Node 18+). Safe to re-run: sessions are keyed by id and
// sent whole; earlier imports are replaced only by ones that cover at least
// as much, and sessions tracked live or edited in TimeTrack are left alone.
import { readdirSync, lstatSync, statSync, existsSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

// No default: a self-hosted user must never send their key and session
// metadata to the hosted service by accident. The plugin's hook sets it.
const API = (process.env.TIMETRACK_API_URL || opt("api-url", "")).replace(/\/$/, "");
const KEY = process.env.TIMETRACK_API_KEY;
const DAYS = Number(opt("days", "30"));
const DRY_RUN = flag("dry-run");
// Claude Code keeps history under $CLAUDE_CONFIG_DIR when it's set (one per account).
const ROOT = opt("dir", join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects"));
const SPAN_GAP_MS = 60_000; // compress activity closer than this into one span
const MAX_SPAN_MS = 12 * 3600_000; // the server rejects spans over 24 h
const MAX_SPANS = 10_000; // the server's per-session limit
const BATCH = 50;
// Stay under nginx's default 1 MB body limit in front of the API.
const MAX_BODY_BYTES = 800_000;
// Written only after a complete, successful import (the plugin's first-run marker).
const MARK = opt("mark");

const done = (message) => {
  // Nothing (more) to import is a finished import: don't retry every session.
  console.log(message);
  if (MARK && !DRY_RUN) writeFileSync(MARK, new Date().toISOString() + "\n");
  process.exit(0);
};

if (!KEY) {
  console.error("Set TIMETRACK_API_KEY (Settings → API keys in TimeTrack).");
  process.exit(1);
}
if (!API) {
  console.error("Set TIMETRACK_API_URL to your TimeTrack API, e.g. https://api.track.alfredo.re");
  process.exit(1);
}
if (!existsSync(ROOT)) done(`No Claude Code transcripts found at ${ROOT}`);

const since = Date.now() - DAYS * 86400_000;

function* walk(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return; // unreadable directory: skip it, keep the rest
  }
  for (const name of names) {
    const p = join(dir, name);
    let s;
    try {
      s = lstatSync(p);
      // Never follow symlinked directories (loops); a linked file is fine.
      if (s.isSymbolicLink()) {
        s = statSync(p);
        if (s.isDirectory()) continue;
      }
    } catch {
      continue;
    }
    if (s.isDirectory()) yield* walk(p);
    else if (name.endsWith(".jsonl") && s.mtimeMs >= since) yield p;
  }
}

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

const ACTIVITY_TYPES = new Set(["user", "assistant"]);
const sessions = new Map();

for (const file of walk(ROOT)) {
  // Streamed: transcripts can be hundreds of MB.
  let lines;
  try {
    lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  } catch {
    continue;
  }
  try {
  for await (const line of lines) {
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!o.sessionId || !o.timestamp || !ACTIVITY_TYPES.has(o.type)) continue;
    // The window picks sessions (below), not lines: a re-import with a
    // shorter window must still send whole sessions, or it would replace
    // what an earlier import stored with less.
    const t = Date.parse(o.timestamp);
    if (!t) continue;
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
      u.inputTokens += count(m.usage.input_tokens);
      u.outputTokens += count(m.usage.output_tokens);
      u.cacheReadTokens += count(m.usage.cache_read_input_tokens);
      u.cacheWriteTokens += count(m.usage.cache_creation_input_tokens);
    }
  }
  } catch {
    continue; // unreadable file
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
  // https://user:TOKEN@host/... clones: the credentials never leave the machine.
  if (r) r = r.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1");
  if (r && r.length > 500) r = null;
  remotes.set(cwd, r);
  return r;
};

const toSpans = (times) => {
  const sorted = [...times].sort((a, b) => a - b);
  const spans = [];
  for (const t of sorted) {
    const last = spans[spans.length - 1];
    // Close a span at 12 h even during constant activity: the server
    // rejects single spans over a day.
    if (last && t - last[1] <= SPAN_GAP_MS && t - last[0] < MAX_SPAN_MS) last[1] = t;
    else spans.push([t, t]);
  }
  return spans;
};

/**
 * Spans for one session, within the server's limit. Merging over a wider
 * gap would bill idle time, so a session with more spans than the server
 * takes keeps its most recent ones, and says so.
 */
const fitSpans = (times) => {
  let spans = toSpans(times);
  if (spans.length > MAX_SPANS) {
    console.error(`  note: one very long session was trimmed to its last ${MAX_SPANS} stretches of activity`);
    spans = spans.slice(-MAX_SPANS);
  }
  return spans.map(([a, b]) => [new Date(a).toISOString(), new Date(b).toISOString()]);
};

const payload = [];
for (const [sessionKey, s] of sessions) {
  if (s.times.length < 2) continue;
  // The window selects sessions active in it; each is sent whole.
  if (!s.times.some((t) => t >= since)) continue;
  payload.push({
    sessionKey,
    agent: "claude_code",
    // Clamped to what the server accepts, so one odd session can't fail a batch.
    cwd: s.cwd ? s.cwd.slice(0, 1000) : null,
    gitBranch: s.gitBranch ? s.gitBranch.slice(0, 255) : null,
    gitRemote: remoteFor(s.cwd),
    spans: fitSpans(s.times),
    usage: Object.keys(s.usage).length ? s.usage : undefined,
  });
}

if (payload.length === 0) done(`No Claude Code sessions in the last ${DAYS} days.`);

const hm = (sec) => {
  const minutes = Math.round(sec / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};
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
  skipped_plan: "older than your plan's history window",
  skipped_partial: "already imported with more history than these transcripts have",
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
