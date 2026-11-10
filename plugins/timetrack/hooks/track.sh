#!/bin/sh
# TimeTrack hook for Claude Code.
#
# Sends ONLY: the hook event name, the session id, the working directory,
# and (at session start) the repo's git remote and branch. Never sends
# prompts, tool input/output, assistant messages or transcripts.
#
# Never blocks or breaks the session: no key -> no-op; every request has a
# short timeout; heartbeats are fire-and-forget; always exits 0.
# Plugin options (set at install) win; plain env vars work for manual setups.
API="${CLAUDE_PLUGIN_OPTION_API_URL:-${TIMETRACK_API_URL:-https://api.track.alfredo.re}}"
API="${API%/}"
KEY="${CLAUDE_PLUGIN_OPTION_API_KEY:-${TIMETRACK_API_KEY:-}}"
[ -n "$KEY" ] || exit 0

INPUT=$(cat)

# Read one top-level string field from the hook's JSON input.
field() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r --arg k "$1" '.[$k] // empty | strings' 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$INPUT" | python3 -c 'import json,sys
v = json.load(sys.stdin).get(sys.argv[1])
print(v if isinstance(v, str) else "")' "$1" 2>/dev/null
  else
    printf '%s' "$INPUT" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
  fi
}

EVENT=$(field hook_event_name)
SESSION=$(field session_id)
CWD=$(field cwd)
if [ -z "$EVENT" ] || [ -z "$SESSION" ]; then exit 0; fi

REMOTE=""
BRANCH=""
if [ "$EVENT" = "SessionStart" ] && [ -n "$CWD" ] && command -v git >/dev/null 2>&1; then
  REMOTE=$(git -C "$CWD" remote get-url origin 2>/dev/null)
  BRANCH=$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null)
  # Detached HEAD or a repo without commits has no meaningful branch.
  [ "$BRANCH" = "HEAD" ] && BRANCH=""
fi

# JSON-escape: drop control characters, escape backslashes and quotes.
esc() { printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

BODY=$(printf '{"hook_event_name":"%s","session_id":"%s","cwd":"%s","gitRemote":"%s","gitBranch":"%s"}' \
  "$(esc "$EVENT")" "$(esc "$SESSION")" "$(esc "$CWD")" "$(esc "$REMOTE")" "$(esc "$BRANCH")")

post() {
  curl -sS -m "$1" -X POST "$API/agent-events?format=claude-code" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -H "X-Client: claude_code" \
    --data-binary "$BODY" 2>/dev/null
}

if [ "$EVENT" = "SessionStart" ]; then
  # First session after install: import the last 30 days of past sessions
  # in the background (opt out with the plugin's "Import past sessions").
  DATA="${CLAUDE_PLUGIN_DATA:-}"
  if [ -n "$DATA" ] && [ "${CLAUDE_PLUGIN_OPTION_IMPORT_HISTORY:-true}" = "true" ] \
    && [ ! -f "$DATA/history-imported" ] && command -v node >/dev/null 2>&1; then
    mkdir -p "$DATA" && touch "$DATA/history-imported"
    TIMETRACK_API_URL="$API" TIMETRACK_API_KEY="$KEY" \
      nohup node "$(dirname "$0")/../scripts/import-transcripts.mjs" --days 30 \
      </dev/null >"$DATA/import.log" 2>&1 &
  fi
  # The response is Claude Code hook JSON; its additionalContext tells the
  # agent which TimeTrack timer and project this session is tracked under.
  post 3
else
  # Heartbeat: detach so the agent never waits on the network.
  post 2 </dev/null >/dev/null 2>&1 &
fi
exit 0
