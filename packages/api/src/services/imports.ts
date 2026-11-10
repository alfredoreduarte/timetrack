import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { normalizeGitRemote } from "../utils/git";
import { emitToUser } from "../realtime";
import { ServiceContext } from "./context";
import { recordAudit } from "./audit";
import { getHourlyRate } from "./rates";
import { resolveProjectAndTask } from "./ownership";
import { resolveProjectForRepo, repoLabel } from "./repos";
import { cleanText } from "./text";
import { cleanSessionKey, FUTURE_SKEW_MS } from "./timers";
import { agentLabel } from "./agentEvents";

export const MAX_IMPORT_SESSIONS = 100;
export const MAX_SPANS_PER_SESSION = 10_000;

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

export type ImportStatus = "imported" | "replaced" | "skipped_live" | "empty" | "invalid";

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

/**
 * Imports past agent sessions (e.g. parsed from Claude Code transcripts) as
 * stopped timers with closed segments. Idempotent per sessionKey: sessions
 * that were tracked live are never touched; earlier imports are replaced.
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
        return [start, end] as Span;
      });
    } catch (e) {
      results.push({ ...base, sessionKey, status: "invalid", reason: (e as Error).message });
      continue;
    }

    const segments = segmentSpans(spans, gapSeconds);
    if (segments.length === 0) {
      results.push({ ...base, sessionKey, status: "empty" });
      continue;
    }

    const existing = await prisma.timer.findUnique({
      where: { userId_sessionKey: { userId: ctx.userId, sessionKey } },
      select: { id: true, createdVia: true },
    });
    if (existing && existing.createdVia !== "import") {
      results.push({ ...base, sessionKey, status: "skipped_live", timerId: existing.id, reason: "session was tracked live" });
      continue;
    }

    const gitRemote = normalizeGitRemote(s.gitRemote);
    const cwd = s.cwd?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 1000) || null;
    let project: { id: string; name: string } | null = null;
    let projectId: string | null = null;
    if (s.projectId) {
      const ref = await resolveProjectAndTask(prisma, ctx.userId, { projectId: s.projectId });
      projectId = ref.projectId ?? null;
      const p = projectId
        ? await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
        : null;
      project = p;
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

    if (!opts.dryRun) {
      const agent = s.agent?.trim().toLowerCase().slice(0, 40) || "claude_code";
      const repo = repoLabel({ gitRemote, cwd });
      const description =
        cleanText(s.title, "title", 500) ??
        `${agentLabel(agent)}${repo ? ` · ${repo}` : ""}${s.gitBranch ? ` (${s.gitBranch.slice(0, 100)})` : ""}`;
      result.timerId = await prisma.$transaction(
        async (tx) => {
          const rate = await getHourlyRate(tx, ctx.userId, projectId, null);
          const data = {
            status: "stopped",
            description,
            agent,
            createdVia: "import",
            isAiGenerated: true,
            cwd,
            gitRemote,
            gitBranch: s.gitBranch?.slice(0, 255) ?? null,
            projectId,
            taskId: null,
            lastActivityAt: endedAt,
            startedAt,
            stoppedAt: endedAt,
            usage: (s.usage ?? undefined) as Prisma.InputJsonValue | undefined,
          };
          let timerId: string;
          if (existing) {
            await tx.timeEntry.deleteMany({ where: { timerId: existing.id } });
            await tx.timer.update({ where: { id: existing.id }, data });
            timerId = existing.id;
          } else {
            const created = await tx.timer.create({
              data: { ...data, userId: ctx.userId, sessionKey },
            });
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
    }
    results.push(result);
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
  return { dryRun: Boolean(opts.dryRun), gapSeconds, totals, sessions: results };
}
