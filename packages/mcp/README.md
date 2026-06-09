# @timetrack/mcp

An MCP server that lets AI coding agents (Claude Code, Cursor, anything that speaks the [Model Context Protocol](https://modelcontextprotocol.io)) start/stop TimeTrack timers and manage projects and tasks without touching the UI.

Time entries created through this server are automatically flagged as AI work, so the billing multiplier in Reports applies to them.

## Setup

1. **Mint an API key.** In the TimeTrack web UI: Settings → API Keys → "+ New Key". Name it something like "Claude Code". Leave "Used by an AI agent" checked (the default). Copy the `tt_…` token — it's shown only once.

2. **Install / build.**

   ```bash
   cd packages/mcp
   npm install
   npm run build
   ```

3. **Set environment variables** (in your shell or in your MCP client's config):

   ```bash
   export TIMETRACK_API_URL=https://app.track.alfredo.re/api
   export TIMETRACK_API_KEY=tt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   For local dev against `npm run dev`, use `TIMETRACK_API_URL=http://localhost:3011`.

4. **Wire it into Claude Code**:

   ```bash
   claude mcp add timetrack -- node /absolute/path/to/packages/mcp/dist/index.js
   ```

   Or in your `~/.claude/mcp_servers.json`:

   ```json
   {
     "mcpServers": {
       "timetrack": {
         "command": "node",
         "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
         "env": {
           "TIMETRACK_API_URL": "https://app.track.alfredo.re/api",
           "TIMETRACK_API_KEY": "tt_..."
         }
       }
     }
   }
   ```

   Restart Claude Code. The tools below become available.

## Tools

| Tool             | Description                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `running_timers` | List all currently running timers. Concurrent timers are supported (parallel AI sessions).   |
| `start_timer`    | Start a timer with optional `description`, `projectId`, `taskId`. Doesn't stop existing ones. |
| `stop_timer`     | Stop a timer. If `id` is omitted and exactly one timer is running, that one is stopped.      |
| `recent_entries` | List recent time entries (default 10).                                                       |
| `list_projects`  | List the user's projects.                                                                    |
| `create_project` | Create a project (`name` required).                                                          |
| `list_tasks`     | List tasks, optionally filtered by `projectId`.                                              |
| `create_task`    | Create a task under a project.                                                               |
| `update_task`    | Patch a task — rename, change rate, or mark complete.                                        |
| `whoami`         | Return the authenticated user; useful for verifying the right account.                       |

## How AI labeling works

Every request from this server sends `X-Client: mcp` so entries land with `createdVia: "mcp"`. The flag `isAiGenerated` defaults to whatever the API key's `aiByDefault` was set to (`true` for keys created with "Used by an AI agent" checked). Override per-request with `X-AI-Generated: false` if you ever need to.

## Configuration reference

| Variable             | Default                          | Notes                                       |
| -------------------- | -------------------------------- | ------------------------------------------- |
| `TIMETRACK_API_URL`  | `https://app.track.alfredo.re/api` | API base — the prod web app proxies `/api/*` to the API container. Trailing slash optional. For local dev: `http://localhost:3011`. |
| `TIMETRACK_API_KEY`  | (required)                       | `tt_…` token from Settings → API Keys.      |

## Troubleshooting

- **`TIMETRACK_API_KEY is required`** — the env var isn't reaching the server process. Re-check your MCP client config.
- **`401 Invalid API key`** — the token was revoked or copied wrong. Mint a new one.
- **`401 API key expired`** — set a new expiry or mint a new key.
- **Entries not flagged as AI** — confirm the key has `aiByDefault: true` (visible as an "AI" badge next to the key name in Settings). Or pass `X-AI-Generated: true` explicitly.
