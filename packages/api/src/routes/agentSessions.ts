import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { prisma } from "../utils/database";
import {
  importAgentSessions,
  importRequestBytes,
  IMPORT_ROW_BYTES,
  MAX_IMPORT_SESSIONS,
  MAX_SPANS_PER_SESSION,
} from "../services/imports";

const router = express.Router();
router.use(authenticate);

// An import can write tens of thousands of rows and take a second or more,
// and each one in progress or waiting holds its parsed body (about 6 MB for
// a 1 MB request, the cap in app.ts). So at most a few run at once across
// everyone, a few more wait their turn for a while, and the rest are told
// the server is busy (code import_busy, which the plugin retries): memory
// stays under (running + waiting) x 6 MB. Each account gets one place,
// running or waiting, so no account holds more than one; a second import
// for the same account (another machine, or /import during the first-run
// import) is told so at once. A flood from many accounts only delays
// imports, which are safe to resend.
// The hourly cap only stops a runaway loop: the plugin's import of a long
// history sends up to 50 sessions per request, one at a time, so it must
// fit a year of heavy use. The daily cap bounds what one account can add to
// the database: AGENT_IMPORT_MB_PER_DAY (100) of estimated on-disk size,
// indexes and audit rows included, against about 50 MB for a heavy year
// (18k sessions, 36k segments). Each request is checked before it runs at
// its largest possible size, priced from the fields it will store and an
// upper bound on its description (no HTML sanitizing before the check),
// with any other import of the account still writing counted at its own
// (if AGENT_IMPORTS_PER_ACCOUNT allows one), so none crosses the cap.
// It is charged afterwards for what it added: a re-import pays for its
// audit row and any growth, so resending a long history the next day
// carries on where the cap stopped it.
// No RateLimit headers: importers retry later.
const importLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: () => Number(process.env.AGENT_IMPORTS_PER_HOUR || 1000),
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? "anon",
  message: { error: "Too many imports from this account; try again in an hour." },
});
const maxConcurrentImports = () => Number(process.env.AGENT_IMPORTS_CONCURRENT || 2);
const maxImportsPerAccount = () => Number(process.env.AGENT_IMPORTS_PER_ACCOUNT || 1);
const maxQueuedImports = () => Number(process.env.AGENT_IMPORTS_QUEUED || 6);
const importWaitMs = () => Number(process.env.AGENT_IMPORT_WAIT_MS || 20_000);
const maxBytesPerDay = () => Number(process.env.AGENT_IMPORT_MB_PER_DAY || 100) * 1024 * 1024;
const busy = () => createError("Other imports are running right now; try again in a minute.", 429, "import_busy");

/** Estimated bytes this account's imports added in the last 24 hours. */
async function importedBytesToday(userId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [row] = await prisma.$queryRaw<Array<{ bytes: number }>>`
    SELECT COALESCE(SUM(${IMPORT_ROW_BYTES.audit} + GREATEST(
      COALESCE((changes->'storedBytes'->>'to')::bigint, 0) - COALESCE((changes->'storedBytes'->>'from')::bigint, 0), 0
    )), 0)::float8 AS bytes
    FROM audit_events
    WHERE user_id = ${userId} AND created_at > ${since}
      AND entity_type = 'timer' AND action IN ('import', 'reimport')`;
  return row?.bytes ?? 0;
}

/** The pre-check bounds of each account's imports that haven't finished writing. */
const pendingBytes = new Map<string, number>();

let importsRunning = 0;
const waitingForSlot: Array<() => void> = [];
const importsByAccount = new Map<string, number>();

/** Runs fn in an import slot: first come, first served, waiting up to importWaitMs for one. */
async function inImportSlot<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const mine = importsByAccount.get(userId) ?? 0;
  if (mine >= maxImportsPerAccount()) {
    throw createError("Another import for this account is running; send this one when it finishes.", 429, "import_busy");
  }
  importsByAccount.set(userId, mine + 1);
  try {
    if (importsRunning < maxConcurrentImports() && waitingForSlot.length === 0) {
      importsRunning++;
    } else if (waitingForSlot.length >= maxQueuedImports()) {
      throw busy();
    } else {
      // A finishing import hands its slot straight to the next in line.
      await new Promise<void>((resolve, reject) => {
        const go = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          const at = waitingForSlot.indexOf(go);
          if (at >= 0) waitingForSlot.splice(at, 1);
          reject(busy());
        }, importWaitMs());
        waitingForSlot.push(go);
      });
    }
    try {
      return await fn();
    } finally {
      const next = waitingForSlot.shift();
      if (next) next();
      else importsRunning--;
    }
  } finally {
    const left = (importsByAccount.get(userId) ?? 1) - 1;
    if (left > 0) importsByAccount.set(userId, left);
    else importsByAccount.delete(userId);
  }
}

const usage = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
});

const importSchema = z.object({
  dryRun: z.boolean().optional(),
  // Import only activity after the last AI work tracked some other way.
  afterTrackedWork: z.boolean().optional(),
  sessions: z
    .array(
      z.object({
        sessionKey: z.string().min(1).max(200),
        agent: z.string().max(40).nullable().optional(),
        cwd: z.string().max(1000).nullable().optional(),
        gitRemote: z.string().max(500).nullable().optional(),
        gitBranch: z.string().max(255).nullable().optional(),
        title: z.string().max(500).nullable().optional(),
        projectId: z.string().nullable().optional(),
        spans: z.array(z.tuple([z.string(), z.string()])).max(MAX_SPANS_PER_SESSION),
        usage: z.record(z.string().max(100), usage).optional(),
      })
    )
    .min(1)
    .max(MAX_IMPORT_SESSIONS),
});

/**
 * @swagger
 * /agent-sessions/import:
 *   post:
 *     summary: Import past agent sessions (e.g. from Claude Code transcripts)
 *     description: |
 *       Each session's activity spans are split into segments wherever the
 *       agent was silent longer than your agent idle timeout, mapped to a
 *       project by repository, and stored as a stopped timer. Re-importing a
 *       session replaces the earlier import; sessions tracked live are
 *       skipped. dryRun returns the totals without writing.
 *
 *       One import per account runs at a time. Request bodies are limited
 *       to 1 MB, and by default each account to 1000 requests an hour and
 *       100 MB of imported data a day (estimated on-disk size).
 *     tags: [Agents]
 *     responses:
 *       200:
 *         description: Per-session results and totals
 *       413:
 *         description: Body over 1 MB; send fewer sessions per request
 *       429:
 *         description: |
 *           code import_busy: other imports are running; resend the same
 *           request in a few seconds. code import_daily_limit: the account
 *           wrote its daily import budget; import the rest tomorrow. No code:
 *           the hourly request cap.
 */
router.post(
  "/import",
  importLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { dryRun, afterTrackedWork, sessions } = importSchema.parse(req.body);
    const ctx = contextFromRequest(req);
    const result = await inImportSlot(ctx.userId, async () => {
      if (dryRun) return importAgentSessions(ctx, sessions, { dryRun, afterTrackedWork });
      // Reserved before reading the total, in one synchronous step: an
      // import that commits meanwhile is counted in the total, its pending
      // bound, or both, never in neither.
      const bound = importRequestBytes(sessions);
      const others = pendingBytes.get(ctx.userId) ?? 0;
      pendingBytes.set(ctx.userId, others + bound);
      try {
        if ((await importedBytesToday(ctx.userId, ctx.now())) + others + bound > maxBytesPerDay()) {
          throw createError(
            "This account has imported as much as it can today; import the rest tomorrow.",
            429,
            "import_daily_limit"
          );
        }
        return await importAgentSessions(ctx, sessions, { dryRun, afterTrackedWork });
      } finally {
        const left = (pendingBytes.get(ctx.userId) ?? bound) - bound;
        if (left > 0) pendingBytes.set(ctx.userId, left);
        else pendingBytes.delete(ctx.userId);
      }
    });
    res.json(result);
  })
);

export default router;
