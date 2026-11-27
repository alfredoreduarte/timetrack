import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { importAgentSessions, MAX_IMPORT_SESSIONS, MAX_SPANS_PER_SESSION } from "../services/imports";

const router = express.Router();
router.use(authenticate);

// An import can write tens of thousands of rows and take a second or more,
// and each one in progress or waiting holds its parsed body (about 6 MB for
// a 1 MB request, the cap in app.ts). So at most a few run at once across
// everyone, a few more wait their turn for a while, and the rest are told
// the server is busy (code import_busy, which the plugin retries): memory
// stays under (running + waiting) x 6 MB. Each account may only have a
// couple running or waiting, so a few accounts can't keep everyone else
// out. The hourly cap only stops a runaway loop: the plugin's import of a
// long history sends up to 50 sessions per request, one at a time, so it
// must fit a year of heavy use. No RateLimit headers: importers retry later.
const importLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: () => Number(process.env.AGENT_IMPORTS_PER_HOUR || 1000),
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? "anon",
  message: { error: "Too many imports from this account; try again in an hour." },
});
const maxConcurrentImports = () => Number(process.env.AGENT_IMPORTS_CONCURRENT || 2);
const maxImportsPerAccount = () => Number(process.env.AGENT_IMPORTS_PER_ACCOUNT || 2);
const maxQueuedImports = () => Number(process.env.AGENT_IMPORTS_QUEUED || 6);
const importWaitMs = () => Number(process.env.AGENT_IMPORT_WAIT_MS || 20_000);
const busy = () => createError("Other imports are running right now; try again in a minute.", 429, "import_busy");

let importsRunning = 0;
const waitingForSlot: Array<() => void> = [];
const importsByAccount = new Map<string, number>();

/** Runs fn in an import slot: first come, first served, waiting up to importWaitMs for one. */
async function inImportSlot<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const mine = importsByAccount.get(userId) ?? 0;
  if (mine >= maxImportsPerAccount()) {
    throw createError("This account already has imports running; send them one at a time.", 429, "import_busy");
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
 *     tags: [Agents]
 */
router.post(
  "/import",
  importLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { dryRun, afterTrackedWork, sessions } = importSchema.parse(req.body);
    const ctx = contextFromRequest(req);
    const result = await inImportSlot(ctx.userId, () => importAgentSessions(ctx, sessions, { dryRun, afterTrackedWork }));
    res.json(result);
  })
);

export default router;
