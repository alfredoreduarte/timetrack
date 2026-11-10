---
description: Import past Claude Code sessions into TimeTrack (preview first)
argument-hint: "[days, default 30]"
allowed-tools: Bash(node:*)
---
TimeTrack imports the last 30 days automatically on the first session after install. To import again or further back:

1. Check that `TIMETRACK_API_KEY` is set in the shell (`[ -n "$TIMETRACK_API_KEY" ] && echo set`). If it isn't, tell the user to run `export TIMETRACK_API_KEY=tt_...` (their key from TimeTrack → Settings → API keys) and stop.
2. Preview: `node "${CLAUDE_PLUGIN_ROOT}/scripts/import-transcripts.mjs" --days ${ARGUMENTS:-30} --dry-run`
3. Show the preview and ask whether to import. If yes, run the same command without `--dry-run`.

Only timestamps, repository names and token counts are sent — never prompts, messages or code.
