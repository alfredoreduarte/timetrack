import { Prisma } from "@prisma/client";
import { prisma, TxClient } from "../utils/database";
import { createError, AppError } from "../middleware/errorHandler";
import { normalizeGitRemote } from "../utils/git";
import { emitToUser } from "../realtime";
import { ServiceContext } from "./context";
import { recordAudit } from "./audit";
import { getHourlyRate } from "./rates";
import { resolveProjectAndTask } from "./ownership";
import { resolveProjectForRepo, repoLabel } from "./repos";
import { cleanText } from "./text";
import { cleanAgent, cleanSessionKey, cleanToken, FUTURE_SKEW_MS, validateUsage } from "./timers";
import { agentLabel } from "./agentEvents";
import { estimateCost } from "../billing/pricing";
import { settleAwaitingNotes } from "./timerNotes";
import { getEntitlements, historyFloor } from "./entitlements";

export const MAX_IMPORT_SESSIONS = 100;
export const MAX_SPANS_PER_SESSION = 10_000;
/** Transcripts can't predate this; older timestamps are corrupt data. */
const EARLIEST_SPAN = Date.parse("2020-01-01T00:00:00Z");
/** One transcript message never spans more than a day. */
const MAX_SPAN_MS = 24 * 3600 * 1000;

export type Span = [Date, Date];

/**
 * Merges activity spans into billable segments: spans closer than
 * `gapSeconds` belong to the same segment; a longer silence ends it — the
 * same rule live heartbeats follow. Zero-length segments are dropped.
 */
export function segmentSpans(spans: Span[], gapSeconds: number): Span[] {
  const sorted = spans
    .filter(([a, b]) => b.getTime() >= a.getTime())
    .sort((x, y) => x[0].getTime() - y[0].getTime());
  const out: Span[] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start.getTime() - last[1].getTime() <= gapSeconds * 1000) {
      if (end > last[1]) last[1] = end;
    } else {
      out.push([start, end]);
    }
  }
  return out.filter(([a, b]) => b.getTime() - a.getTime() >= 1000);
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface ImportSessionInput {
  sessionKey: string;
  agent?: string | null;
  cwd?: string | null;
  gitRemote?: string | null;
  gitBranch?: string | null;
  title?: string | null;
  projectId?: string | null;
  /** Activity spans as [startISO, endISO]; a single message is [t, t]. */
  spans: Array<[string, string]>;
  usage?: Record<string, TokenUsage>;
}

export type ImportStatus =
  | "imported"
  | "replaced"
  | "skipped_live"
  | "skipped_edited"
  | "skipped_plan"
  | "skipped_partial"
  | "skipped_tracked"
  | "empty"
  | "invalid";

export interface ImportSessionResult {
  sessionKey: string;
  status: ImportStatus;
  reason?: string;
  timerId?: string;
  project: { id: string; name: string } | null;
  segments: number;
  trackedSeconds: number;
  startedAt: Date | null;
  endedAt: Date | null;
}

const sumSeconds = (segments: Span[]) =>
  segments.reduce((s, [a, b]) => s + Math.floor((b.getTime() - a.getTime()) / 1000), 0);

type Skip = {
  status: "skipped_live" | "skipped_edited" | "skipped_plan" | "skipped_partial" | "skipped_tracked";
  reason: string;
};

/** What an import brings, for comparing it with a stored copy. */
interface Incoming {
  /** Activity spans (after any plan-window clipping). */
  spans: Span[];
  segments: Span[];
  /** Set when the plan window clipped this import: where, and the skip. */
  clipped?: { floor: Date; skip: Skip };
}

/**
 * Why a stored import must stay as it is, or null if this import may replace
 * it. Run at the first look and again under the timer's row lock, so a
 * resume, an edit or another import that lands in between still counts.
 *
 * - It never ran live, it is stopped, and neither it nor its segments were
 *   edited, deleted or reassigned since: anything else belongs to the user.
 * - A clipped import may replace it only if that deletes nothing from before
 *   the plan window (e.g. the stored copy was clipped too).
 * - A re-import may grow a session, never shrink it: transcripts get pruned,
 *   windows get narrower, subagent files age out, and what was imported
 *   before is still true.
 */
async function storedCopyBlocker(db: TxClient, userId: string, timerId: string, incoming: Incoming): Promise<Skip | null> {
  const timer = await db.timer.findUniqueOrThrow({
    where: { id: timerId },
    select: { createdVia: true, status: true, startedAt: true, stoppedAt: true },
  });
  if (timer.createdVia !== "import" || timer.status !== "stopped") {
    return { status: "skipped_live", reason: "session was tracked live" };
  }
  const [timerEdits, lastImport, entries] = await Promise.all([
    db.auditEvent.count({
      where: { userId, entityType: "timer", entityId: timerId, action: { notIn: ["import", "reimport"] } },
    }),
    db.auditEvent.findFirst({
      where: { userId, entityType: "timer", entityId: timerId, action: { in: ["import", "reimport"] } },
      orderBy: { createdAt: "desc" },
      select: { changes: true },
    }),
    db.timeEntry.findMany({ where: { timerId }, select: { id: true, duration: true, startTime: true } }),
  ]);
  const entryEdits = entries.length
    ? await db.auditEvent.count({
        where: { userId, entityType: "time_entry", entityId: { in: entries.map((e) => e.id) } },
      })
    : 0;
  const recorded = (lastImport?.changes ?? {}) as {
    segments?: { to?: number };
    trackedSeconds?: { to?: number };
    gapSeconds?: { to?: number };
  };
  const seconds = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);
  // Deleting a segment leaves no audit on the survivors; the totals the
  // import recorded catch it.
  const changedSinceImport =
    recorded.segments?.to !== entries.length || recorded.trackedSeconds?.to !== seconds;
  if (timerEdits > 0 || entryEdits > 0 || changedSinceImport) {
    return { status: "skipped_edited", reason: "session was edited after it was imported" };
  }

  // Replacing deletes every stored segment, so a clipped import must not
  // replace one that has history from before the plan window.
  if (incoming.clipped && entries.some((e) => e.startTime < incoming.clipped!.floor)) return incoming.clipped.skip;

  // Compared at the gap the stored copy was built with: the user may have
  // changed their idle timeout since, which alone moves segment edges and
  // totals (a lone message can merge or drop) without any history lost.
  const gap = recorded.gapSeconds?.to;
  const ref = typeof gap === "number" ? segmentSpans(incoming.spans, gap) : incoming.segments;
  if (
    ref.length === 0 ||
    ref[0][0].getTime() > timer.startedAt.getTime() + 1000 ||
    (timer.stoppedAt && ref[ref.length - 1][1].getTime() < timer.stoppedAt.getTime() - 1000) ||
    (typeof gap === "number" && sumSeconds(ref) < seconds)
  ) {
    return { status: "skipped_partial", reason: "already imported with more of this session than this import has" };
  }
  return null;
}

/** Timers that agent hooks or imports created: sessions an import itself tracks. */
const SESSION_ORIGINS = ["agent_hook", "import"];

/**
 * When the user's AI work tracked some other way ends: AI entries outside
 * any hook-created or imported timer (e.g. from an MCP or API-key setup,
 * session id or not), by the timer's origin, which a resume never changes.
 * Now, if such work is running.
 */
async function otherAiWorkUntil(userId: string, now: Date): Promise<Date | null> {
  const where: Prisma.TimeEntryWhereInput = {
    userId,
    isAiGenerated: true,
    OR: [{ timerId: null }, { timer: { OR: [{ origin: null }, { origin: { notIn: SESSION_ORIGINS } }] } }],
  };
  const running = await prisma.timeEntry.findFirst({ where: { ...where, isRunning: true }, select: { id: true } });
  if (running) return now;
  const last = await prisma.timeEntry.findFirst({
    where: { ...where, endTime: { not: null } },
    orderBy: { endTime: "desc" },
    select: { endTime: true },
  });
  return last?.endTime ?? null;
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

class SkipSession extends Error {
  constructor(readonly skip: Skip) {
    super(skip.reason);
  }
}

/** Imports one validated session; throws SkipSession when it must be left alone. */
async function importOne(
  ctx: ServiceContext,
  s: ImportSessionInput,
  sessionKey: string,
  incoming: Incoming & { gapSeconds: number },
  dryRun: boolean,
  idleTimeoutSeconds: number
): Promise<ImportSessionResult> {
  const { segments, gapSeconds } = incoming;
  const existing = await prisma.timer.findUnique({
    where: { userId_sessionKey: { userId: ctx.userId, sessionKey } },
    select: { id: true },
  });
  if (existing) {
    const skip = await storedCopyBlocker(prisma, ctx.userId, existing.id, incoming);
    if (skip) throw new SkipSession(skip);
  }

  const gitRemote = normalizeGitRemote(s.gitRemote);
  const cwd = cleanToken(s.cwd?.slice(0, 1000), "cwd", 1000) ?? null;
  const gitBranch = cleanToken(s.gitBranch?.slice(0, 255), "gitBranch", 255) ?? null;
  const agent = cleanAgent(s.agent) ?? "claude_code";
  let project: { id: string; name: string } | null = null;
  let projectId: string | null = null;
  if (s.projectId) {
    const ref = await resolveProjectAndTask(prisma, ctx.userId, { projectId: s.projectId });
    projectId = ref.projectId ?? null;
    project = projectId
      ? await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
      : null;
  } else {
    const match = await resolveProjectForRepo(prisma, ctx.userId, { gitRemote, cwd });
    if (match) {
      projectId = match.project.id;
      project = { id: match.project.id, name: match.project.name };
    }
  }

  const startedAt = segments[0][0];
  const endedAt = segments[segments.length - 1][1];
  const trackedSeconds = sumSeconds(segments);
  const result: ImportSessionResult = {
    sessionKey,
    status: existing ? "replaced" : "imported",
    project,
    segments: segments.length,
    trackedSeconds,
    startedAt,
    endedAt,
  };
  if (dryRun) return result;

  const repo = repoLabel({ gitRemote, cwd });
  const description =
    cleanText(s.title, "title", 500, { truncate: true }) ??
    cleanText(`${agentLabel(agent)}${repo ? ` · ${repo}` : ""}${gitBranch ? ` (${gitBranch})` : ""}`, "description", 500, {
      truncate: true,
    });
  result.timerId = await prisma.$transaction(
    async (tx) => {
      if (existing) {
        // Re-checked under the row lock: a live resume, an edit or another
        // import that lands after the first look wins over this one.
        await tx.$queryRaw`SELECT id FROM timers WHERE id = ${existing.id} FOR UPDATE`;
        const skip = await storedCopyBlocker(tx, ctx.userId, existing.id, incoming);
        if (skip) throw new SkipSession(skip);
      }
      const rate = await getHourlyRate(tx, ctx.userId, projectId, null);
      const data = {
        status: "stopped",
        description,
        agent,
        createdVia: "import",
        isAiGenerated: true,
        cwd,
        gitRemote,
        gitBranch,
        projectId,
        taskId: null,
        lastActivityAt: endedAt,
        startedAt,
        stoppedAt: endedAt,
        // If the session is reopened (resume, or activity after the import),
        // it goes quiet and pauses like any hook-tracked session.
        idleTimeoutSeconds,
        usage: (s.usage ?? undefined) as Prisma.InputJsonValue | undefined,
        // Like usage: a re-import without usage keeps the stored cost.
        costUsd: s.usage ? estimateCost(s.usage).costUsd : undefined,
      };
      let timerId: string;
      let notesToReattach: string[] = [];
      if (existing) {
        // The stored copy is replaced; its notes move to the new segments.
        notesToReattach = (
          await tx.timerNote.findMany({ where: { timerId: existing.id, timeEntryId: { not: null } }, select: { id: true } })
        ).map((n) => n.id);
        await tx.timeEntry.deleteMany({ where: { timerId: existing.id } });
        await tx.timer.update({ where: { id: existing.id }, data });
        timerId = existing.id;
      } else {
        const created = await tx.timer.create({ data: { ...data, userId: ctx.userId, sessionKey, origin: "import" } });
        timerId = created.id;
      }
      await tx.timeEntry.createMany({
        data: segments.map(([a, b]) => ({
          userId: ctx.userId,
          timerId,
          description,
          startTime: a,
          endTime: b,
          duration: Math.floor((b.getTime() - a.getTime()) / 1000),
          isRunning: false,
          projectId,
          hourlyRateSnapshot: rate,
          createdVia: "import",
          isAiGenerated: true,
          stopReason: "import",
        })),
      });
      if (notesToReattach.length > 0) {
        // Each to the segment it was written during or after, else the first
        // (all of a session's segments are in one project).
        await tx.$executeRaw`
          UPDATE timer_notes n SET time_entry_id = COALESCE(
            (SELECT e.id FROM time_entries e
              WHERE e.timer_id = n.timer_id AND e."startTime" <= n.created_at
              ORDER BY e."startTime" DESC, e.id DESC LIMIT 1),
            (SELECT e.id FROM time_entries e
              WHERE e.timer_id = n.timer_id
              ORDER BY e."startTime" ASC, e.id ASC LIMIT 1))
          WHERE n.id = ANY(${notesToReattach})`;
      }
      if (existing) await settleAwaitingNotes(tx, timerId);
      await recordAudit(tx, ctx, {
        entityType: "timer",
        entityId: timerId,
        action: existing ? "reimport" : "import",
        changes: {
          segments: { from: null, to: segments.length },
          trackedSeconds: { from: null, to: trackedSeconds },
          // The idle gap the segments were built with (see storedCopyBlocker).
          gapSeconds: { from: null, to: gapSeconds },
        },
      });
      return timerId;
    },
    { timeout: 30_000 }
  );
  return result;
}

/**
 * Imports past agent sessions (e.g. parsed from Claude Code transcripts) as
 * stopped timers with closed segments. Idempotent per sessionKey: sessions
 * that were tracked live or edited are never touched; untouched earlier
 * imports are replaced. A bad session is reported and doesn't stop the rest.
 */
export async function importAgentSessions(
  ctx: ServiceContext,
  sessions: ImportSessionInput[],
  opts: { dryRun?: boolean; gapSeconds?: number; afterTrackedWork?: boolean } = {}
) {
  if (sessions.length === 0) throw createError("sessions cannot be empty", 400);
  if (sessions.length > MAX_IMPORT_SESSIONS) {
    throw createError(`At most ${MAX_IMPORT_SESSIONS} sessions per request`, 400);
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: { agentIdleTimeoutSeconds: true },
  });
  const gapSeconds = opts.gapSeconds ?? user.agentIdleTimeoutSeconds;
  const now = ctx.now();
  // Free plan: only the most recent days are imported.
  const entitlements = await getEntitlements(ctx.userId, prisma, now);
  const planFloor = historyFloor(entitlements, now);
  // Opt-in (the plugin's importer sends it): start after the last AI work
  // tracked some other way, so that time isn't billed a second time.
  const trackedUntil = opts.afterTrackedWork ? await otherAiWorkUntil(ctx.userId, now) : null;
  const floor = trackedUntil && (!planFloor || trackedUntil > planFloor) ? trackedUntil : planFloor;
  const byTracked = Boolean(trackedUntil && floor === trackedUntil);
  const results: ImportSessionResult[] = [];

  for (const s of sessions) {
    const base = { project: null, segments: 0, trackedSeconds: 0, startedAt: null, endedAt: null };
    const sessionKey = cleanSessionKey(s.sessionKey);
    if (!sessionKey) {
      results.push({ ...base, sessionKey: String(s.sessionKey ?? ""), status: "invalid", reason: "missing sessionKey" });
      continue;
    }
    if (!Array.isArray(s.spans) || s.spans.length > MAX_SPANS_PER_SESSION) {
      results.push({ ...base, sessionKey, status: "invalid", reason: `spans must be an array of at most ${MAX_SPANS_PER_SESSION}` });
      continue;
    }

    let spans: Span[];
    try {
      spans = s.spans.map(([a, b]) => {
        const start = new Date(a);
        const end = new Date(b);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("invalid timestamp");
        if (end.getTime() > now.getTime() + FUTURE_SKEW_MS) throw new Error("timestamp in the future");
        if (start.getTime() < EARLIEST_SPAN) throw new Error("timestamp before 2020");
        if (end.getTime() - start.getTime() > MAX_SPAN_MS) throw new Error("a span is longer than 24 hours");
        return [start, end] as Span;
      });
    } catch (e) {
      results.push({ ...base, sessionKey, status: "invalid", reason: (e as Error).message });
      continue;
    }

    // The plan's history window limits what an import may add — never what
    // is already stored: a clipped session must not replace a full one.
    const clipped = Boolean(floor && spans.some(([a]) => a < floor));
    if (floor) {
      spans = spans
        .filter(([, b]) => b > floor)
        .map(([a, b]) => [a < floor ? floor : a, b] as Span);
    }
    const segments = segmentSpans(spans, gapSeconds);
    if (segments.length === 0) {
      results.push(
        clipped && byTracked
          ? { ...base, sessionKey, status: "skipped_tracked", reason: `before ${floor!.toISOString()}, already tracked in TimeTrack` }
          : { ...base, sessionKey, status: "empty" }
      );
      continue;
    }

    try {
      // The same bounds as live usage (a timer keeps at most 20 models).
      if (s.usage) validateUsage(s.usage);
      const clippedSkip: Skip | undefined = !clipped
        ? undefined
        : byTracked
          ? {
              status: "skipped_tracked",
              reason: `AI work until ${floor!.toISOString()} was already tracked in TimeTrack; left as stored`,
            }
          : {
              status: "skipped_plan" as const,
              // A clipped import can't replace a session that has stored history
              // from before the window without deleting it, so the stored copy
              // stays as is (new work in a resumed session is tracked live by
              // the plugin's hooks).
              reason: `began more than ${entitlements.limits.historyDays} days ago; left as stored so its earlier history is kept (upgrade to re-import it in full)`,
            };
      results.push(
        await importOne(
          ctx,
          s,
          sessionKey,
          { spans, segments, clipped: clippedSkip && floor ? { floor, skip: clippedSkip } : undefined, gapSeconds },
          Boolean(opts.dryRun),
          user.agentIdleTimeoutSeconds
        )
      );
    } catch (e) {
      if (e instanceof SkipSession) {
        results.push({ ...base, sessionKey, ...e.skip });
      } else if (isUniqueViolation(e)) {
        // A live SessionStart (or a parallel import) created it first.
        results.push({ ...base, sessionKey, status: "skipped_live", reason: "session is being tracked live" });
      } else if (typeof (e as AppError).statusCode === "number" && (e as AppError).statusCode! < 500) {
        results.push({ ...base, sessionKey, status: "invalid", reason: (e as Error).message });
      } else {
        throw e;
      }
    }
  }

  const counted = results.filter((r) => r.status === "imported" || r.status === "replaced");
  const byProject = new Map<string, { project: { id: string; name: string } | null; seconds: number }>();
  for (const r of counted) {
    const key = r.project?.id ?? "unassigned";
    const row = byProject.get(key) ?? { project: r.project, seconds: 0 };
    row.seconds += r.trackedSeconds;
    byProject.set(key, row);
  }
  const totals = {
    sessions: counted.length,
    skipped: results.length - counted.length,
    trackedSeconds: counted.reduce((s, r) => s + r.trackedSeconds, 0),
    unassignedSeconds: byProject.get("unassigned")?.seconds ?? 0,
    byProject: Array.from(byProject.values()).sort((a, b) => b.seconds - a.seconds),
  };

  if (!opts.dryRun && counted.length > 0) {
    emitToUser(ctx.userId, "timers-imported", { sessions: counted.length });
  }
  return {
    dryRun: Boolean(opts.dryRun),
    gapSeconds,
    limitedByPlan: planFloor ? { historyDays: entitlements.limits.historyDays, since: planFloor.toISOString() } : null,
    trackedUntil: byTracked ? floor!.toISOString() : null,
    totals,
    sessions: results,
  };
}
