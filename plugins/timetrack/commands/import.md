---
description: Import past Claude Code sessions into TimeTrack (preview first)
argument-hint: "[days, default 30]"
allowed-tools: Bash(node:*)
---
TimeTrack imports the last 30 days automatically on the first session after install. To import again or further back:

1. Days to import: the number in "$ARGUMENTS", or 30 if it is empty.
2. Check that both `TIMETRACK_API_KEY` and `TIMETRACK_API_URL` are set in the shell (`[ -n "$TIMETRACK_API_KEY" ] && [ -n "$TIMETRACK_API_URL" ] && echo set`). If not, tell the user to run `export TIMETRACK_API_KEY=tt_...` (TimeTrack → Settings → API keys) and `export TIMETRACK_API_URL=https://api.track.alfredo.re` (or their own TimeTrack server's API URL), and stop. Never guess the URL.
3. Preview: `node "${CLAUDE_PLUGIN_ROOT}/scripts/import-transcripts.mjs" --days <days> --dry-run`
4. Show the preview and ask whether to import. If yes, run the same command without `--dry-run`.

It sends session ids, the working directory, the git remote (credentials stripped) and branch, activity timestamps and token counts per model — never prompts, messages or code. Sessions are sent whole, so a shorter window never removes time imported earlier. Activity before the last AI work already tracked in TimeTrack another way (e.g. an older MCP setup) is left out so it isn't billed twice; add `--include-tracked` only if the user asks to import it anyway.
