#!/usr/bin/env node
/**
 * TimeTrack stdio MCP server — a thin bridge to the hosted MCP endpoint
 * (`<TIMETRACK_API_URL>/mcp`). Tools, descriptions and behavior live on the
 * server, so an installed copy of this package never goes stale: new tools
 * show up without reinstalling.
 *
 * Prefer connecting your client to the remote endpoint directly when it
 * supports HTTP MCP servers (Claude Code does):
 *   claude mcp add --transport http timetrack https://api.track.alfredo.re/mcp \
 *     --header "Authorization: Bearer $TIMETRACK_API_KEY"
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const VERSION = "2.0.0";
const DEFAULT_URL = "https://api.track.alfredo.re";
const TOKEN_RE = /tt_[A-Za-z0-9]+/g;

const baseUrl = (process.env.TIMETRACK_API_URL ?? DEFAULT_URL).replace(/\/$/, "");
const apiKey = process.env.TIMETRACK_API_KEY;

const redact = (s: string) => s.replace(TOKEN_RE, "tt_[REDACTED]");

let remote: Client | null = null;
let connecting: Promise<Client> | null = null;

/** Connects lazily (and reconnects after failures) so startup never blocks on the network. */
async function getRemote(): Promise<Client> {
  if (remote) return remote;
  if (!connecting) {
    connecting = (async () => {
      if (!apiKey) {
        throw new Error(
          "TIMETRACK_API_KEY is not set. Create a key in TimeTrack (Settings → API keys) and add it to this MCP server's env."
        );
      }
      const client = new Client({ name: "timetrack-stdio-bridge", version: VERSION });
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${apiKey}`, "X-Client": "mcp" } },
      });
      await client.connect(transport);
      client.onclose = () => {
        remote = null;
      };
      remote = client;
      return client;
    })().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

/** Shown instead of the real tools when TimeTrack can't be reached at listing time. */
const STATUS_TOOL = {
  name: "timetrack_status",
  description:
    "TimeTrack could not be reached when tools were listed. Call this to retry and see why; once it connects, the full TimeTrack tool list appears.",
  inputSchema: { type: "object" as const, properties: {} },
};

// Same guidance the hosted server sends (packages/api/src/mcp/server.ts).
const INSTRUCTIONS = `TimeTrack records billable time for a developer whose AI agents work in parallel.

A TIMER is one unit of work (usually one agent session); each running stretch is a TIME ENTRY. Many timers may run at once. Entries can be edited, backfilled or deleted at any time; every change is kept in an audit trail.

- If your context says "TimeTrack is tracking this session (timer X)", hooks created that timer and keep it accurate. Don't start another, and don't pause or stop it yourself unless the user asks. Use that timerId with add_note and update_timer.
- Otherwise call start_timer when you begin billable work, with a stable sessionKey. Call pause_timer while you wait on the human and resume_timer when work continues; stop_timer when the work is done.
- Assign work to the right client project (list_projects); if the repository has no project, ask the user.
- Log what you accomplished with add_note, written for the client.
- Times are ISO 8601. Never invent times in the future.`;

const errorResult = (e: unknown) => ({
  content: [{ type: "text" as const, text: `Error: ${redact(e instanceof Error ? e.message : String(e))}` }],
  isError: true,
});

async function main() {
  const server = new Server(
    { name: "timetrack", version: VERSION },
    { capabilities: { tools: { listChanged: true } }, instructions: INSTRUCTIONS }
  );

  // A failed listing (offline, bad key) must not leave the session without
  // tools until a manual reconnect: list a status tool instead, and tell the
  // client to list again once a connection works.
  let listFailed = false;
  const connected = async () => {
    if (listFailed) {
      listFailed = false;
      await server.sendToolListChanged().catch(() => undefined);
    }
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const result = await (await getRemote()).listTools();
      listFailed = false;
      return result;
    } catch (e) {
      remote = null;
      listFailed = true;
      console.error("timetrack-mcp: listing tools failed:", redact(e instanceof Error ? e.message : String(e)));
      return { tools: [STATUS_TOOL] };
    }
  });

  const callTool = async (req: { params: { name: string; arguments?: Record<string, unknown> } }) => {
    try {
      const client = await getRemote();
      if (req.params.name === STATUS_TOOL.name) {
        await connected();
        return { content: [{ type: "text" as const, text: "Connected to TimeTrack. The full tool list is available now." }] };
      }
      const result = await client.callTool({ name: req.params.name, arguments: req.params.arguments ?? {} });
      await connected();
      return result;
    } catch (e) {
      remote = null; // force a reconnect on the next call
      return errorResult(e);
    }
  };
  // The SDK's handler generics are heavy; the cast keeps type-checking fast.
  server.setRequestHandler(
    CallToolRequestSchema,
    callTool as unknown as Parameters<typeof server.setRequestHandler>[1]
  );

  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error("timetrack-mcp failed to start:", redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
