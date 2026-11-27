# @timetrack/mcp

TimeTrack's MCP tools for AI agents: run **parallel timers** (one per agent
session), **pause and resume** them, **edit, backfill or delete past entries**,
log work notes, and build client-ready **timesheets**.

## Recommended: use the hosted server

The tools are served by the TimeTrack API at `/mcp` (Streamable HTTP), so
nothing needs installing and nothing goes stale.

- **Claude Code** — install the plugin, which also tracks sessions
  automatically through hooks (see `plugins/timetrack/README.md`):

  ```
  claude plugin install timetrack --marketplace alfredoreduarte/timetrack
  ```

  Or add just the MCP server:

  ```bash
  claude mcp add --transport http timetrack https://api.track.alfredo.re/mcp \
    --header "Authorization: Bearer $TIMETRACK_API_KEY"
  ```

- **Any client with HTTP MCP support** — URL `https://api.track.alfredo.re/mcp`,
  header `Authorization: Bearer tt_…`.

Create the `tt_…` key in TimeTrack under **Settings → API keys**.

## This package: stdio bridge

For clients that only speak stdio. It forwards every request to the hosted
endpoint, so the tool list always matches the server.

```bash
npm run build --workspace=@timetrack/mcp
claude mcp add timetrack -e TIMETRACK_API_KEY=tt_… -- node /absolute/path/to/packages/mcp/dist/index.js
```

| Variable | Default | Notes |
|---|---|---|
| `TIMETRACK_API_KEY` | (required) | `tt_…` key |
| `TIMETRACK_API_URL` | `https://api.track.alfredo.re` | API base; `https://app.track.alfredo.re/api` also works. Local dev: `http://localhost:3011` |

## Tools

| Tool | What it does |
|---|---|
| `whoami` | Account, billing settings, plan, active timers |
| `start_timer` | Start a timer; idempotent with `sessionKey`; picks the project from `gitRemote`/`cwd` |
| `pause_timer` / `resume_timer` / `stop_timer` | Control a timer (optional backdated `at`) |
| `list_timers` / `get_timer` | Active, paused or stopped timers; one timer with segments and notes |
| `update_timer` | Reassign project/task/description/AI flag for all segments; learns the repo → project mapping |
| `add_note` | Work-log note shown on the client timesheet |
| `list_entries` / `create_entry` / `update_entry` / `delete_entry` / `bulk_update_entries` | Full editing of past and running entries |
| `entry_history` | Audit trail: who changed what, via which client |
| `list_projects` / `create_project` / `update_project` | Projects (clients), rates, linked repos, billing policy |
| `list_tasks` / `create_task` / `update_task` | Tasks |
| `timesheet` | Client-ready timesheet (Markdown or JSON) with overlap-aware billing |
| `create_share_link` / `list_share_links` / `revoke_share_link` | Read-only timesheet links for clients |
| `report_usage` | Token usage per model → API-equivalent cost lines |

Entries created through MCP are flagged as AI work (`isAiGenerated`) unless the
API key was created with "Used by an AI agent" unchecked.
