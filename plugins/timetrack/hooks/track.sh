#!/bin/sh
# TimeTrack hook for Claude Code.
#
# Sends ONLY: the hook event name, the session id, the working directory,
# the SessionStart source, and the repo's git remote (credentials stripped)
# and branch. Never sends prompts, tool input/output, assistant messages or
# transcripts.
#
# Never blocks or breaks the session: no key -> no-op; every request has a
# short timeout; heartbeats are fire-and-forget; always exits 0.
# Plugin options (set at install) win; plain env vars work for manual setups.
API="${CLAUDE_PLUGIN_OPTION_API_URL:-${TIMETRACK_API_URL:-https://api.track.alfredo.re}}"
API="${API%/}"
KEY="${CLAUDE_PLUGIN_OPTION_API_KEY:-${TIMETRACK_API_KEY:-}}"
[ -n "$KEY" ] || exit 0
# TimeTrack keys are tt_ plus hex; anything else is a typo (and would break
# the curl config below).
case "$KEY" in *[!A-Za-z0-9_-]*) exit 0 ;; esac

INPUT=$(cat)

# Parse the hook JSON once, with the first real JSON parser available.
# Prints: event, session id, cwd (raw, one per line), then a JSON object
# with the whitelisted fields. No parser -> no tracking: a regex would pick
# up keys nested inside tool input and report the wrong session.
parse_jq() {
  command -v jq >/dev/null 2>&1 || return 0
  printf '%s' "$INPUT" | jq -r '
      def str: if type == "string" then gsub("[\r\n]"; " ") else "" end;
      (.hook_event_name | str), (.session_id | str), (.cwd | str),
      ({hook_event_name, session_id, cwd, source}
        | map_values(if type == "string" then . else null end) | tojson)' 2>/dev/null
}
parse_node() {
  command -v node >/dev/null 2>&1 || return 0
  printf '%s' "$INPUT" | node -e '
      let d = "";
      process.stdin.on("data", (c) => (d += c)).on("end", () => {
        let j;
        try { j = JSON.parse(d); } catch { return; }
        const str = (v) => (typeof v === "string" ? v.replace(/[\r\n]/g, " ") : "");
        const o = {};
        for (const k of ["hook_event_name", "session_id", "cwd", "source"]) o[k] = typeof j[k] === "string" ? j[k] : null;
        process.stdout.write([str(j.hook_event_name), str(j.session_id), str(j.cwd), JSON.stringify(o)].join("\n") + "\n");
      });' 2>/dev/null
}
parse_python() {
  command -v python3 >/dev/null 2>&1 || return 0
  printf '%s' "$INPUT" | python3 -c '
import json, sys
j = json.load(sys.stdin)
s = lambda v: v.replace("\r", " ").replace("\n", " ") if isinstance(v, str) else ""
o = {k: (j.get(k) if isinstance(j.get(k), str) else None) for k in ("hook_event_name", "session_id", "cwd", "source")}
print(s(j.get("hook_event_name"))); print(s(j.get("session_id"))); print(s(j.get("cwd"))); print(json.dumps(o, separators=(",", ":")))' 2>/dev/null
}

# The first parser that works wins (a version-manager shim can be on PATH
# and still fail).
PARSED=$(parse_jq)
[ -n "$PARSED" ] || PARSED=$(parse_node)
[ -n "$PARSED" ] || PARSED=$(parse_python)
{ IFS= read -r EVENT; IFS= read -r SESSION; IFS= read -r CWD; IFS= read -r FIELDS; } <<EOF
$PARSED
EOF
if [ -z "$EVENT" ] || [ -z "$SESSION" ] || [ -z "$FIELDS" ]; then exit 0; fi

DATA="${CLAUDE_PLUGIN_DATA:-}"
SID=$(printf '%s' "$SESSION" | tr -cd 'A-Za-z0-9_-' | cut -c1-80)

# Tool calls can fire several hooks a second; the server records at most one
# heartbeat per 15 s per timer anyway, so send at most one per session per
# 15 s. Prompts, turn ends and session start/end always go through.
case "$EVENT" in
  PreToolUse|PostToolUse|PostToolUseFailure|Notification|SubagentStart|SubagentStop|PreCompact)
    if [ -n "$DATA" ] && [ -n "$SID" ]; then
      STAMP="$DATA/hb-$SID"
      NOW=$(date +%s)
      LAST=$(cat "$STAMP" 2>/dev/null)
      case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
      [ $((NOW - LAST)) -lt 15 ] && exit 0
      mkdir -p "$DATA" 2>/dev/null && printf '%s' "$NOW" >"$STAMP" 2>/dev/null
    fi
    ;;
esac

# The repo's remote and branch, looked up at session start and cached for
# the session — so a timer created by a later event (session start missed)
# still knows its repo.
REMOTE=""
BRANCH=""
REPO_CACHE=""
[ -n "$DATA" ] && [ -n "$SID" ] && REPO_CACHE="$DATA/repo-$SID"
if [ "$EVENT" != "SessionStart" ] && [ -n "$REPO_CACHE" ] && [ -f "$REPO_CACHE" ]; then
  { IFS= read -r REMOTE; IFS= read -r BRANCH; } <"$REPO_CACHE"
elif [ -n "$CWD" ] && command -v git >/dev/null 2>&1 && { [ "$EVENT" = "SessionStart" ] || [ -n "$REPO_CACHE" ]; }; then
  REMOTE=$(git -C "$CWD" remote get-url origin 2>/dev/null)
  # https://user:TOKEN@host/... clones: the credentials never leave the machine.
  REMOTE=$(printf '%s' "$REMOTE" | sed -E 's#^([A-Za-z][A-Za-z0-9+.-]*://)[^/@]*@#\1#')
  BRANCH=$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null)
  # Detached HEAD or a repo without commits has no meaningful branch.
  [ "$BRANCH" = "HEAD" ] && BRANCH=""
  # Metadata the server wouldn't store must never stop tracking: drop it.
  [ "${#BRANCH}" -gt 255 ] && BRANCH=""
  [ "${#REMOTE}" -gt 500 ] && REMOTE=""
  if [ -n "$REPO_CACHE" ]; then
    mkdir -p "$DATA" 2>/dev/null && printf '%s\n%s\n' "$REMOTE" "$BRANCH" >"$REPO_CACHE" 2>/dev/null
  fi
fi

# JSON-escape the two values that don't come from the parser.
esc() { printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }
BODY="${FIELDS%\}},\"gitRemote\":\"$(esc "$REMOTE")\",\"gitBranch\":\"$(esc "$BRANCH")\"}"

# The key goes to curl on stdin (a config line), never on its command line,
# where other processes and exec logs could see it.
post() {
  printf 'header = "Authorization: Bearer %s"\n' "$KEY" | curl -fsS -K - -m "$1" -X POST \
    "$API/agent-events?format=claude-code" \
    -H "Content-Type: application/json" \
    -H "X-Client: claude_code" \
    --data-binary "$BODY" 2>/dev/null
}

if [ "$EVENT" = "SessionStart" ]; then
  # Heartbeat stamps and repo caches of sessions that never sent SessionEnd.
  [ -n "$DATA" ] && find "$DATA" -maxdepth 1 \( -name 'hb-*' -o -name 'repo-*' \) -type f -mtime +2 -exec rm -f {} \; 2>/dev/null
  # First session after install: import the last 30 days of past sessions
  # in the background (opt out with the plugin's "Import past sessions").
  # The importer writes history-imported only after a complete import, so a
  # failed run is retried next session; the lock keeps parallel sessions
  # from importing twice (a lock older than an hour is from a dead run).
  if [ -n "$DATA" ] && [ "${CLAUDE_PLUGIN_OPTION_IMPORT_HISTORY:-true}" = "true" ] \
    && [ ! -f "$DATA/history-imported" ] && command -v node >/dev/null 2>&1; then
    mkdir -p "$DATA"
    find "$DATA" -maxdepth 1 -name import.lock -type d -mmin +60 -exec rmdir {} \; 2>/dev/null
    if mkdir "$DATA/import.lock" 2>/dev/null; then
      SCRIPT="$(dirname "$0")/../scripts/import-transcripts.mjs"
      TIMETRACK_API_URL="$API" TIMETRACK_API_KEY="$KEY" nohup sh -c \
        'node "$1" --days 30 --mark "$2/history-imported"; rmdir "$2/import.lock"' sh "$SCRIPT" "$DATA" \
        </dev/null >"$DATA/import.log" 2>&1 &
    fi
  fi
  # The response is Claude Code hook JSON whose additionalContext tells the
  # agent which timer and project this session is tracked under. Anything
  # else (an error page while the API restarts, an error body) would land in
  # Claude's context, so only well-formed hook output is printed.
  OUT=$(post 3)
  case "$OUT" in
    '{"hookSpecificOutput"'*) printf '%s\n' "$OUT" ;;
  esac
else
  if [ "$EVENT" = "SessionEnd" ] && [ -n "$DATA" ] && [ -n "$SID" ]; then
    rm -f "$DATA/hb-$SID" "$DATA/repo-$SID"
  fi
  # Heartbeat: detach so the agent never waits on the network.
  post 2 </dev/null >/dev/null 2>&1 &
fi
exit 0
