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

const errorResult = (e: unknown) => ({
  content: [{ type: "text" as const, text: `Error: ${redact(e instanceof Error ? e.message : String(e))}` }],
  isError: true,
});

async function main() {
  const server = new Server(
    { name: "timetrack", version: VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "TimeTrack records billable time for developers whose AI agents work in parallel. Call whoami or list_timers to start; tool descriptions explain the rest.",
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const client = await getRemote();
    return client.listTools();
  });

  const callTool = async (req: { params: { name: string; arguments?: Record<string, unknown> } }) => {
    try {
      const client = await getRemote();
      return await client.callTool({ name: req.params.name, arguments: req.params.arguments ?? {} });
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
