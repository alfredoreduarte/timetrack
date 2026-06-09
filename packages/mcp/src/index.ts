#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TimeTrackClient, TimeTrackError } from "./client.js";

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const tools: ToolDef[] = [
  {
    name: "running_timers",
    description:
      "List all currently running timers (most recently started first). Concurrent timers are supported — multiple AI sessions on different projects can each have their own running timer.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "start_timer",
    description:
      "Start a new timer. Concurrent timers are allowed — this never auto-stops an existing one. Returns the created time entry.",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Free-text description of what you're working on.",
        },
        projectId: { type: "string", description: "Project ID from list_projects." },
        taskId: { type: "string", description: "Task ID from list_tasks (must belong to projectId)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "stop_timer",
    description:
      "Stop a running timer. Pass the entry id. If id is omitted and exactly one timer is running, that one is stopped; otherwise the call returns the list of running timers so you can pick.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Time entry id from running_timers." },
        endTime: {
          type: "string",
          description:
            "ISO 8601 timestamp. Defaults to now if omitted — only set this for backfills.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "recent_entries",
    description: "List recent time entries for the user (most recent first).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (default 10, max 50)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_projects",
    description: "List all of the user's projects.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_project",
    description: "Create a new project.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name." },
        description: { type: "string" },
        color: { type: "string", description: "Hex color like #3B82F6." },
        hourlyRate: { type: "number", description: "Override the user's default rate." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description: "List tasks. Optionally filter by project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_task",
    description: "Create a new task under a project.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        projectId: { type: "string" },
        description: { type: "string" },
        hourlyRate: { type: "number" },
      },
      required: ["name", "projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "update_task",
    description: "Update an existing task (rename, change rate, mark complete).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        hourlyRate: { type: "number" },
        isCompleted: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "whoami",
    description: "Return the authenticated user. Useful to confirm the right account before mutating.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const err = (e: unknown): ToolResult => {
  const message =
    e instanceof TimeTrackError
      ? e.message
      : e instanceof Error
        ? e.message
        : String(e);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
};

async function main() {
  const client = new TimeTrackClient();

  const server = new Server(
    { name: "timetrack", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  const handleCall = async (
    req: { params: { name: string; arguments?: Record<string, unknown> } }
  ): Promise<ToolResult> => {
    const { name, arguments: args = {} } = req.params;
    const a: Record<string, unknown> = args;
    try {
      switch (name) {
        case "running_timers":
          return ok(await client.runningTimers());
        case "start_timer":
          return ok(
            await client.startTimer({
              description: a.description as string | undefined,
              projectId: a.projectId as string | undefined,
              taskId: a.taskId as string | undefined,
            })
          );
        case "stop_timer": {
          let id = a.id as string | undefined;
          if (!id) {
            const running = await client.runningTimers();
            const entries = running.timeEntries ?? [];
            if (entries.length === 0) {
              // Returning isError tells the agent the action did NOT complete,
              // rather than letting it report "stopped" to the user.
              return {
                content: [
                  {
                    type: "text",
                    text: "No timers are currently running — nothing to stop.",
                  },
                ],
                isError: true,
              };
            }
            if (entries.length > 1) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Ambiguous: ${entries.length} timers are running. Call stop_timer again with one of these ids:\n${JSON.stringify(entries, null, 2)}`,
                  },
                ],
                isError: true,
              };
            }
            id = entries[0].id;
          }
          return ok(await client.stopTimer(id, a.endTime as string | undefined));
        }
        case "recent_entries":
          return ok(await client.recentEntries((a.limit as number | undefined) ?? 10));
        case "list_projects":
          return ok(await client.listProjects());
        case "create_project":
          return ok(
            await client.createProject({
              name: a.name as string,
              description: a.description as string | undefined,
              color: a.color as string | undefined,
              hourlyRate: a.hourlyRate as number | undefined,
            })
          );
        case "list_tasks":
          return ok(await client.listTasks(a.projectId as string | undefined));
        case "create_task":
          return ok(
            await client.createTask({
              name: a.name as string,
              projectId: a.projectId as string,
              description: a.description as string | undefined,
              hourlyRate: a.hourlyRate as number | undefined,
            })
          );
        case "update_task":
          return ok(
            await client.updateTask(a.id as string, {
              name: a.name as string | undefined,
              description: a.description as string | undefined,
              hourlyRate: a.hourlyRate as number | undefined,
              isCompleted: a.isCompleted as boolean | undefined,
            })
          );
        case "whoami":
          return ok(await client.whoami());
        default:
          return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      return err(e);
    }
  };

  // The SDK's setRequestHandler generic type explodes when many handlers stack;
  // cast the handler to the broad shape to keep type-checking fast.
  server.setRequestHandler(
    CallToolRequestSchema,
    handleCall as unknown as Parameters<typeof server.setRequestHandler>[1]
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("timetrack-mcp failed to start:", e);
  process.exit(1);
});
