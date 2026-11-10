import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../utils/database";
import { AppError } from "../middleware/errorHandler";
import { ServiceContext } from "../services/context";
import {
  addTimerNote,
  getTimerDetail,
  listTimers,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  updateTimer,
} from "../services/timers";
import {
  bulkUpdateEntries,
  createEntry,
  deleteEntry,
  getEntryHistory,
  listEntries,
  updateEntry,
} from "../services/entries";
import {
  createProject,
  createTask,
  listProjects,
  listTasks,
  updateProject,
  updateTask,
} from "../services/catalog";

export const MCP_SERVER_VERSION = "2.0.0";

export const MCP_INSTRUCTIONS = `TimeTrack records billable time for a developer whose AI agents work in parallel.

Model: a TIMER is one unit of work (usually one agent session). It can be paused and resumed; each running stretch is a TIME ENTRY (segment). Many timers may run at once — one per parallel session. Entries can be edited, backfilled or deleted at any time, including past ones; every change is recorded in an audit trail.

Guidance:
- If your context says "TimeTrack is tracking this session (timer X)", a timer already exists for you (created by hooks). Do NOT start another; use that timerId with add_note, update_timer, pause_timer.
- Otherwise call start_timer when you begin billable work and pass a stable sessionKey (any id unique to your session) so retries never create duplicates. Stop or pause it when the work ends or you wait on the human for a long time.
- Assign work to the right client project (list_projects). If the repository has no project, ask the user or use update_timer once they tell you — TimeTrack remembers the repo.
- Log what you accomplished with add_note; these notes become timesheet lines the client reads, so write them for a client.
- Times are ISO 8601. Never invent times in the future.`;

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
});

const fail = (message: string): ToolResult => ({
  content: [{ type: "text", text: `Error: ${message}` }],
  isError: true,
});

/** Runs a tool body, turning service errors into MCP tool errors. */
const run = async (fn: () => Promise<unknown>): Promise<ToolResult> => {
  try {
    return ok(await fn());
  } catch (e) {
    const err = e as AppError;
    if (err && typeof err.statusCode === "number" && err.statusCode < 500) return fail(err.message);
    if (e instanceof z.ZodError) return fail(e.errors.map((x) => x.message).join("; "));
    throw e;
  }
};

const iso = z.string().describe("ISO 8601 timestamp, e.g. 2026-03-02T15:04:05Z");
const id = (what: string) => z.string().min(1).describe(`${what} id`);

/** Trims a timer view to what an LLM needs. */
const compactTimer = (t: Awaited<ReturnType<typeof listTimers>>[number]) => ({
  id: t.id,
  status: t.status,
  description: t.description,
  project: t.project,
  task: t.task,
  agent: t.agent,
  sessionKey: t.sessionKey,
  pauseReason: t.pauseReason,
  trackedSeconds: t.trackedSeconds,
  segmentCount: t.segmentCount,
  lastActivityAt: t.lastActivityAt,
  repo: t.gitRemote ?? t.cwd,
  currentEntryId: t.currentEntry?.id ?? null,
});

type ToolAnnotations = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };

export function buildMcpServer(ctx: ServiceContext): McpServer {
  const server = new McpServer(
    { name: "timetrack", version: MCP_SERVER_VERSION },
    { instructions: MCP_INSTRUCTIONS }
  );

  // The SDK's registerTool generics exceed TypeScript's instantiation depth
  // with this many tools; this wrapper keeps zod-inferred argument types.
  const register = <S extends z.ZodRawShape>(
    name: string,
    config: { description: string; inputSchema: S; annotations?: ToolAnnotations },
    cb: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<ToolResult>
  ): void => {
    (server.registerTool as unknown as (n: string, c: unknown, f: unknown) => void).call(
      server,
      name,
      config,
      cb
    );
  };

  // ---- Account ------------------------------------------------------------
  register(
    "whoami",
    {
      description: "The authenticated user, their billing settings and currently active timers.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: ctx.userId },
          select: {
            id: true,
            name: true,
            email: true,
            defaultHourlyRate: true,
            aiMultiplier: true,
            agentIdleTimeoutSeconds: true,
          },
        });
        const timers = await listTimers(ctx, { status: "active" });
        return { user, actingAs: ctx.actorLabel ?? ctx.actorType, activeTimers: timers.map(compactTimer) };
      })
  );

  // ---- Projects & tasks ---------------------------------------------------
  register(
    "list_projects",
    {
      description: "List projects (clients) with their hourly rate and linked repositories.",
      inputSchema: { includeInactive: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    ({ includeInactive }) =>
      run(async () => ({
        projects: (await listProjects(ctx, includeInactive ? {} : { isActive: true })).map((p) => ({
          id: p.id,
          name: p.name,
          hourlyRate: p.hourlyRate,
          isActive: p.isActive,
          repoPatterns: p.repoPatterns,
        })),
      }))
  );

  register(
    "create_project",
    {
      description: "Create a project (typically a client). repoPatterns links repositories (git remotes like github.com/acme/web, or absolute paths).",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().optional().describe("Hex color like #3B82F6"),
        hourlyRate: z.number().nonnegative().optional(),
        repoPatterns: z.array(z.string()).max(50).optional(),
      },
    },
    (args) => run(async () => ({ project: await createProject(ctx, args) }))
  );

  register(
    "update_project",
    {
      description: "Update a project. repoPatterns replaces the whole list; addRepoPattern appends one.",
      inputSchema: {
        projectId: id("Project"),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        hourlyRate: z.number().nonnegative().nullable().optional(),
        isActive: z.boolean().optional(),
        repoPatterns: z.array(z.string()).max(50).optional(),
        addRepoPattern: z.string().optional(),
      },
    },
    ({ projectId, addRepoPattern, ...rest }) =>
      run(async () => {
        let repoPatterns = rest.repoPatterns;
        if (addRepoPattern) {
          const current =
            repoPatterns ??
            (await prisma.project.findFirst({
              where: { id: projectId, userId: ctx.userId },
              select: { repoPatterns: true },
            }))?.repoPatterns ??
            [];
          repoPatterns = [...current, addRepoPattern];
        }
        return { project: await updateProject(ctx, projectId, { ...rest, repoPatterns }) };
      })
  );

  register(
    "list_tasks",
    {
      description: "List tasks, optionally for one project.",
      inputSchema: { projectId: z.string().optional(), includeCompleted: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    ({ projectId, includeCompleted }) =>
      run(async () => ({
        tasks: (
          await listTasks(ctx, { projectId, ...(includeCompleted ? {} : { isCompleted: false }) })
        ).map((t) => ({
          id: t.id,
          name: t.name,
          project: t.project,
          hourlyRate: t.hourlyRate,
          isCompleted: t.isCompleted,
        })),
      }))
  );

  register(
    "create_task",
    {
      description: "Create a task under a project.",
      inputSchema: {
        projectId: id("Project"),
        name: z.string().min(1),
        description: z.string().optional(),
        hourlyRate: z.number().nonnegative().optional(),
      },
    },
    (args) => run(async () => ({ task: await createTask(ctx, args) }))
  );

  register(
    "update_task",
    {
      description: "Rename a task, change its rate, or mark it complete.",
      inputSchema: {
        taskId: id("Task"),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        hourlyRate: z.number().nonnegative().nullable().optional(),
        isCompleted: z.boolean().optional(),
      },
    },
    ({ taskId, ...rest }) => run(async () => ({ task: await updateTask(ctx, taskId, rest) }))
  );

  // ---- Timers -------------------------------------------------------------
  register(
    "start_timer",
    {
      description:
        "Start a timer for billable work. Many timers may run in parallel. Pass a sessionKey unique to your session: repeating the call with the same key returns (or resumes) the same timer instead of creating a duplicate. If no project is given, TimeTrack picks the one linked to gitRemote/cwd.",
      inputSchema: {
        description: z.string().optional().describe("What you're working on, written for the client"),
        projectId: z.string().optional(),
        taskId: z.string().optional(),
        sessionKey: z.string().max(200).optional(),
        agent: z.string().optional().describe("Your agent name, e.g. claude_code, cursor, codex"),
        cwd: z.string().optional(),
        gitRemote: z.string().optional(),
        gitBranch: z.string().optional(),
        startedAt: iso.optional().describe("Only to backdate (max 24h ago)"),
        idleTimeoutSeconds: z.number().int().optional().describe("Auto-pause after this many seconds without heartbeats; omit if you won't send heartbeats"),
      },
    },
    (args) =>
      run(async () => {
        const r = await startTimer(ctx, args);
        return { timer: compactTimer(r.timer), created: r.created, matchedRepoPattern: r.matchedRepoPattern ?? null };
      })
  );

  const timerAction = (
    name: string,
    description: string,
    fn: (timerId: string, at?: string) => Promise<{ timer: Parameters<typeof compactTimer>[0]; changed: boolean }>
  ) =>
    register(
      name,
      {
        description,
        inputSchema: {
          timerId: id("Timer"),
          at: iso.optional().describe("Backdate the action (never in the future)"),
        },
      },
      ({ timerId, at }) =>
        run(async () => {
          const r = await fn(timerId, at);
          return { timer: compactTimer(r.timer), changed: r.changed };
        })
    );

  timerAction("pause_timer", "Pause a timer (e.g. while waiting on the human). Time while paused is not billed.", (t, at) =>
    pauseTimer(ctx, t, { at, reason: "manual" })
  );
  timerAction("resume_timer", "Resume a paused or stopped timer as a new segment.", (t, at) =>
    resumeTimer(ctx, t, { at })
  );

  register(
    "stop_timer",
    {
      description:
        "Stop a timer when the work is done. If timerId is omitted and exactly one timer is running, that one is stopped; otherwise you get the list to choose from.",
      inputSchema: { timerId: z.string().optional(), at: iso.optional() },
    },
    ({ timerId, at }) =>
      run(async () => {
        let target = timerId;
        if (!target) {
          const running = await listTimers(ctx, { status: "running" });
          if (running.length !== 1) {
            return {
              stopped: false,
              reason: running.length === 0 ? "No timer is running." : "Several timers are running; call again with timerId.",
              running: running.map(compactTimer),
            };
          }
          target = running[0].id;
        }
        const r = await stopTimer(ctx, target, { at });
        return { stopped: true, timer: compactTimer(r.timer), changed: r.changed };
      })
  );

  register(
    "list_timers",
    {
      description: "List timers. Default: active (running + paused).",
      inputSchema: {
        status: z.enum(["running", "paused", "stopped", "active", "all"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ status, limit }) => run(async () => ({ timers: (await listTimers(ctx, { status, limit })).map(compactTimer) }))
  );

  register(
    "get_timer",
    {
      description: "A timer with all its segments and notes.",
      inputSchema: { timerId: id("Timer") },
      annotations: { readOnlyHint: true },
    },
    ({ timerId }) => run(async () => ({ timer: await getTimerDetail(ctx, timerId) }))
  );

  register(
    "update_timer",
    {
      description:
        "Change a timer's project, task, description or AI flag. Applies to all of its segments (rates are recomputed). Assigning a project to a timer from an unlinked repository links that repository to the project for future sessions (set rememberRepo=false to skip).",
      inputSchema: {
        timerId: id("Timer"),
        description: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        taskId: z.string().nullable().optional(),
        isAiGenerated: z.boolean().optional(),
        rememberRepo: z.boolean().optional(),
      },
    },
    ({ timerId, ...rest }) =>
      run(async () => {
        const r = await updateTimer(ctx, timerId, rest);
        return {
          timer: compactTimer(r.timer),
          changed: r.changed,
          entriesUpdated: r.entriesUpdated,
          learnedRepoPattern: r.learnedRepoPattern,
        };
      })
  );

  register(
    "add_note",
    {
      description: "Append a work-log note to a timer. Notes appear on the client's timesheet, so write what was accomplished in plain language.",
      inputSchema: { timerId: id("Timer"), note: z.string().min(1).max(2000) },
    },
    ({ timerId, note }) => run(async () => ({ note: await addTimerNote(ctx, timerId, note) }))
  );

  // ---- Entries ------------------------------------------------------------
  register(
    "list_entries",
    {
      description: "List time entries (segments), most recent first. Filter by date range, project, timer or AI flag.",
      inputSchema: {
        startDate: iso.optional(),
        endDate: iso.optional(),
        projectId: z.string().optional(),
        timerId: z.string().optional(),
        isAiGenerated: z.boolean().optional(),
        isRunning: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args) =>
      run(async () => {
        const r = await listEntries(ctx, {
          ...args,
          startDate: args.startDate ? new Date(args.startDate) : undefined,
          endDate: args.endDate ? new Date(args.endDate) : undefined,
        });
        return {
          entries: r.entries.map((e) => ({
            id: e.id,
            description: e.description,
            startTime: e.startTime,
            endTime: e.endTime,
            durationSeconds: e.duration,
            isRunning: e.isRunning,
            project: e.project,
            task: e.task,
            isAiGenerated: e.isAiGenerated,
            timerId: e.timerId,
            hourlyRate: e.hourlyRateSnapshot,
          })),
          pagination: r.pagination,
        };
      })
  );

  register(
    "create_entry",
    {
      description: "Backfill a finished entry (max 24h, never in the future). Attach it to a timer with timerId.",
      inputSchema: {
        startTime: iso,
        endTime: iso,
        description: z.string().optional(),
        projectId: z.string().optional(),
        taskId: z.string().optional(),
        timerId: z.string().optional(),
        isAiGenerated: z.boolean().optional(),
      },
    },
    (args) => run(async () => ({ entry: await createEntry(ctx, args) }))
  );

  register(
    "update_entry",
    {
      description:
        "Edit an entry, past or running: description, times, project, task, AI flag. For a running entry the end can't be set — pause or stop its timer instead.",
      inputSchema: {
        entryId: id("Time entry"),
        description: z.string().nullable().optional(),
        startTime: iso.optional(),
        endTime: iso.optional(),
        projectId: z.string().nullable().optional(),
        taskId: z.string().nullable().optional(),
        isAiGenerated: z.boolean().optional(),
      },
    },
    ({ entryId, ...rest }) => run(async () => ({ entry: await updateEntry(ctx, entryId, rest) }))
  );

  register(
    "delete_entry",
    {
      description: "Delete an entry. Deleting a timer's running segment pauses the timer. The deletion is recorded in the audit trail.",
      inputSchema: { entryId: id("Time entry") },
      annotations: { destructiveHint: true },
    },
    ({ entryId }) =>
      run(async () => {
        await deleteEntry(ctx, entryId);
        return { deleted: true, entryId };
      })
  );

  register(
    "bulk_update_entries",
    {
      description: "Apply the same change (project, task, description, AI flag) to up to 500 entries atomically.",
      inputSchema: {
        entryIds: z.array(z.string()).min(1).max(500),
        description: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        taskId: z.string().nullable().optional(),
        isAiGenerated: z.boolean().optional(),
      },
    },
    ({ entryIds, ...set }) =>
      run(async () => {
        const r = await bulkUpdateEntries(ctx, { ids: entryIds, set });
        return { updated: r.updated };
      })
  );

  register(
    "entry_history",
    {
      description: "Audit trail of an entry: who changed what, when, and through which client.",
      inputSchema: { entryId: id("Time entry") },
      annotations: { readOnlyHint: true },
    },
    ({ entryId }) => run(async () => ({ events: await getEntryHistory(ctx, entryId) }))
  );

  return server;
}
