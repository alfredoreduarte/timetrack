import { prisma } from "../utils/database";
import { createError, AppError } from "../middleware/errorHandler";
import { ServiceContext } from "./context";
import {
  cleanSessionKey,
  findTimerBySessionKey,
  startTimer,
  stopTimer,
  touchTimer,
  TimerView,
} from "./timers";
import { repoLabel } from "./repos";

/**
 * Translates agent lifecycle events (Claude Code hooks, Cursor hooks, or any
 * client speaking the generic shape) into timer operations. Clients send
 * only whitelisted fields — never prompts, tool payloads or transcripts.
 */

export type AgentEventKind = "session_start" | "activity" | "session_end";

// Keys are normalized: lowercase, alphanumerics only, so `SessionStart`,
// `session_start` and `sessionStart` all match.
const EVENT_KINDS: Record<string, AgentEventKind> = {
  // generic
  sessionstart: "session_start",
  start: "session_start",
  sessionend: "session_end",
  end: "session_end",
  activity: "activity",
  heartbeat: "activity",
  prompt: "activity",
  tool: "activity",
  notification: "activity",
  compact: "activity",
  // Claude Code hook_event_name values
  userpromptsubmit: "activity",
  pretooluse: "activity",
  posttooluse: "activity",
  posttoolusefailure: "activity",
  permissionrequest: "activity",
  precompact: "activity",
  subagentstart: "activity",
  subagentstop: "activity",
  // Claude Code `Stop` fires when the agent finishes a turn. That's activity,
  // not the end of work — the human may prompt again in a minute. Idle
  // timeouts decide when the session actually went quiet.
  stop: "activity",
  // Cursor hook names
  beforesubmitprompt: "activity",
  beforeshellexecution: "activity",
  beforemcpexecution: "activity",
  afterfileedit: "activity",
  beforereadfile: "activity",
};

export const classifyAgentEvent = (event: string | undefined | null): AgentEventKind | null =>
  event ? EVENT_KINDS[event.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? null : null;

const AGENT_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
};

export const agentLabel = (agent: string | null | undefined) =>
  (agent && AGENT_LABELS[agent]) || agent || "Agent";

export interface AgentEventInput {
  event: string;
  sessionKey: string;
  agent?: string | null;
  cwd?: string | null;
  gitRemote?: string | null;
  gitBranch?: string | null;
  /**
   * SessionStart source. `startup`/`resume` (or none, for generic clients)
   * mean a person opened the session and may resume a timer they paused or
   * stopped; anything else (`compact`, `clear`, …) is just activity.
   */
  source?: string | null;
  /** SessionEnd reason — informational. */
  reason?: string | null;
}

export type AgentEventAction =
  | "started"
  | "resumed"
  | "touched"
  | "stopped"
  | "ignored"
  | "not_tracked";

export interface AgentEventResult {
  action: AgentEventAction;
  tracked: boolean;
  timer: Pick<TimerView, "id" | "status" | "description" | "project" | "idleTimeoutSeconds"> | null;
  /** Text for the agent's context window (only on session start). */
  context: string | null;
  reason?: string;
}

const summarize = (t: TimerView): AgentEventResult["timer"] => ({
  id: t.id,
  status: t.status,
  description: t.description,
  project: t.project,
  idleTimeoutSeconds: t.idleTimeoutSeconds,
});

/**
 * User-controlled text (project names, folder names) quoted as inert data:
 * no quotes, backticks or line breaks to break out of the sentence, capped.
 */
export const quoteData = (value: string, max = 80): string =>
  JSON.stringify(
    value
      .replace(/[\u0000-\u001f\u007f`"\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );

const isPathPattern = (pattern: string) => pattern.startsWith("/") || /^[a-z]:\//i.test(pattern);

export function sessionContext(
  t: TimerView,
  repo: string | null,
  opts: { matchedRepoPattern?: string | null } = {}
): string {
  if (t.status !== "running") {
    const state = t.status === "stopped" ? "stopped" : "paused";
    return `TimeTrack timer ${t.id} for this session is ${state} by the user, so this work is not being billed. Don't resume it unless the user asks.`;
  }
  const idle = t.idleTimeoutSeconds
    ? ` It pauses by itself after ${Math.round(t.idleTimeoutSeconds / 60)} min without activity and resumes when you continue — don't pause or stop it yourself unless the user asks.`
    : "";
  const tools = `Use the TimeTrack MCP tools with timerId "${t.id}" if the user asks about tracking (add_note to log what you did, update_timer to change the project).`;
  if (t.project) {
    const byFolder =
      opts.matchedRepoPattern && isPathPattern(opts.matchedRepoPattern)
        ? ` The project was picked because this folder is under ${quoteData(opts.matchedRepoPattern, 120)}; if the user's request is clearly for a different client, ask them.`
        : "";
    return `TimeTrack is tracking this session as billable time for the project named ${quoteData(t.project.name)} (timer ${t.id}).${byFolder}${idle} ${tools}`;
  }
  const where = repo ? ` for this repository (${quoteData(repo, 120)})` : "";
  return `TimeTrack is tracking this session (timer ${t.id}) but no project is set${where}. If the user says which client or project this work is for, call update_timer with timerId "${t.id}" and that projectId; TimeTrack will remember the repository for next time.${idle}`;
}

const limitContext = (message: string, appUrl: string) =>
  `TimeTrack is NOT tracking this session: ${message} Manage your plan at ${appUrl}/billing.`;

export async function handleAgentEvent(
  ctx: ServiceContext,
  input: AgentEventInput,
  opts: { appUrl: string; isAiGenerated: boolean }
): Promise<AgentEventResult> {
  const kind = classifyAgentEvent(input.event);
  if (!kind) return { action: "ignored", tracked: false, timer: null, context: null, reason: "unknown event" };

  const sessionKey = cleanSessionKey(input.sessionKey);
  if (!sessionKey) throw createError("sessionKey (or session_id) is required", 400);

  const repo = repoLabel(input);
  const existing = await findTimerBySessionKey(ctx, sessionKey);

  const ensureRunning = async (): Promise<AgentEventResult> => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { agentIdleTimeoutSeconds: true },
    });
    const label = agentLabel(input.agent);
    const branch = input.gitBranch ? ` (${input.gitBranch})` : "";
    const res = await startTimer(ctx, {
      sessionKey,
      agent: input.agent,
      cwd: input.cwd,
      gitRemote: input.gitRemote,
      gitBranch: input.gitBranch,
      isAiGenerated: opts.isAiGenerated,
      // Hook-fed timers get reliable heartbeats, so they may auto-pause.
      idleTimeoutSeconds: existing ? undefined : user.agentIdleTimeoutSeconds,
      description: existing ? undefined : `${label}${repo ? ` · ${repo}` : ""}${branch}`.slice(0, 500),
    });
    const action: AgentEventAction = res.created ? "started" : res.changed ? "resumed" : "touched";
    return {
      action,
      tracked: true,
      timer: summarize(res.timer),
      context:
        kind === "session_start" || res.created
          ? sessionContext(res.timer, repo, { matchedRepoPattern: res.matchedRepoPattern })
          : null,
    };
  };

  const source = input.source?.trim().toLowerCase() || null;
  // Only a person opening the session may override their own pause or stop.
  const openedByPerson = kind === "session_start" && (source === null || source === "startup" || source === "resume");

  try {
    if (kind === "session_end") {
      if (!existing) return { action: "ignored", tracked: false, timer: null, context: null, reason: "no timer for this session" };
      const res = await stopTimer(ctx, existing.id, { reason: "session_end" });
      return { action: res.changed ? "stopped" : "ignored", tracked: false, timer: summarize(res.timer), context: null };
    }

    // An imported session that is still going (the import ran mid-session)
    // was stopped by the importer, not by a person.
    if (!existing || openedByPerson || (existing.status === "stopped" && existing.createdVia === "import")) {
      return await ensureRunning();
    }

    // Activity on a known session, including SessionStart after a compact
    // or /clear: it resumes only what was paused automatically.
    if (existing.status === "stopped") {
      const context =
        kind === "session_start"
          ? `TimeTrack timer ${existing.id} for this session was stopped, so this work is not being billed. Don't restart it unless the user asks.`
          : null;
      return { action: "ignored", tracked: false, timer: null, context, reason: "session already ended" };
    }
    const res = await touchTimer(ctx, existing.id, {});
    return {
      action: res.resumed ? "resumed" : "touched",
      tracked: res.timer.status === "running",
      timer: summarize(res.timer),
      context: kind === "session_start" ? sessionContext(res.timer, repo) : null,
    };
  } catch (e) {
    const err = e as AppError;
    // Plan/concurrency limits must never break the agent: report and move on.
    if (err.statusCode === 402 || err.statusCode === 429) {
      return {
        action: "not_tracked",
        tracked: false,
        timer: null,
        context: kind === "session_start" ? limitContext(err.message, opts.appUrl) : null,
        reason: err.message,
      };
    }
    throw e;
  }
}
