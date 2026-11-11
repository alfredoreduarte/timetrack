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
import { cleanAgent, cleanSessionKey, cleanToken, FUTURE_SKEW_MS } from "./timers";
import { agentLabel } from "./agentEvents";
import { estimateCost } from "../billing/pricing";
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

type Skip = { status: "skipped_live" | "skipped_edited" | "skipped_plan"; reason: string };

/**
 * An earlier import may be replaced only if nothing else ever touched it:
 * it never ran live, it is stopped, and neither it nor its segments were
 * edited, deleted or reassigned since. Anything else belongs to the user.
 */
async function replaceBlocker(db: TxClient, userId: string, timerId: string): Promise<Skip | null> {
  const timer = await db.timer.findUniqueOrThrow({
    where: { id: timerId },
    select: { createdVia: true, status: true },
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
    db.timeEntry.findMany({ where: { timerId }, select: { id: true, duration: true } }),
  ]);
  const entryEdits = entries.length
    ? await db.auditEvent.count({
        where: { userId, entityType: "time_entry", entityId: { in: entries.map((e) => e.id) } },
      })
    : 0;
  const recorded = (lastImport?.changes ?? {}) as {
    segments?: { to?: number };
    trackedSeconds?: { to?: number };
  };
  const seconds = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);
  // Deleting a segment leaves no audit on the survivors; the totals the
  // import recorded catch it.
  const changedSinceImport =
    recorded.segments?.to !== entries.length || recorded.trackedSeconds?.to !== seconds;
  if (timerEdits > 0 || entryEdits > 0 || changedSinceImport) {
    return { status: "skipped_edited", reason: "session was edited after it was imported" };
  }
  return null;
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
  segments: Span[],
  dryRun: boolean,
  idleTimeoutSeconds: number,
  skipIfExisting?: Skip
): Promise<ImportSessionResult> {
  const existing = await prisma.timer.findUnique({
    where: { userId_sessionKey: { userId: ctx.userId, sessionKey } },
    select: { id: true },
  });
  // A clipped import may replace a stored one only if that deletes nothing
  // from before the plan window (e.g. the stored copy was clipped too).
  if (existing && skipIfExisting) {
    const olderStored = await prisma.timeEntry.count({
      where: { timerId: existing.id, startTime: { lt: segments[0][0] } },
    });
    if (olderStored > 0) throw new SkipSession(skipIfExisting);
  }
  if (existing) {
    const blocker = await replaceBlocker(prisma, ctx.userId, existing.id);
    if (blocker) throw new SkipSession(blocker);
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
        // Re-checked under the row lock: a live resume or an edit that lands
        // after the first check wins over the import.
        await tx.$queryRaw`SELECT id FROM timers WHERE id = ${existing.id} FOR UPDATE`;
        const blocker = await replaceBlocker(tx, ctx.userId, existing.id);
        if (blocker) throw new SkipSession(blocker);
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
      if (existing) {
        await tx.timeEntry.deleteMany({ where: { timerId: existing.id } });
        await tx.timer.update({ where: { id: existing.id }, data });
        timerId = existing.id;
      } else {
        const created = await tx.timer.create({ data: { ...data, userId: ctx.userId, sessionKey } });
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
      await recordAudit(tx, ctx, {
        entityType: "timer",
        entityId: timerId,
        action: existing ? "reimport" : "import",
        changes: {
          segments: { from: null, to: segments.length },
          trackedSeconds: { from: null, to: trackedSeconds },
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
  opts: { dryRun?: boolean; gapSeconds?: number } = {}
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
  const floor = historyFloor(entitlements, now);
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
      results.push({ ...base, sessionKey, status: "empty" });
      continue;
    }

    try {
      const skipIfExisting: Skip | undefined = clipped
        ? {
            status: "skipped_plan",
            reason: `starts more than ${entitlements.limits.historyDays} days ago; it is kept as imported (upgrade to re-import it in full)`,
          }
        : undefined;
      results.push(
        await importOne(ctx, s, sessionKey, segments, Boolean(opts.dryRun), user.agentIdleTimeoutSeconds, skipIfExisting)
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
    limitedByPlan: floor ? { historyDays: entitlements.limits.historyDays, since: floor.toISOString() } : null,
    totals,
    sessions: results,
  };
}
