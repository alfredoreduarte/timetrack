import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { importAgentSessions, MAX_IMPORT_SESSIONS, MAX_SPANS_PER_SESSION } from "../services/imports";

const router = express.Router();
router.use(authenticate);

// An import can write tens of thousands of rows and take a second or more.
// At most a few run at once across everyone, which keeps memory bounded on
// a small server (the 1 MB body cap in app.ts bounds each one). The hourly
// cap only stops a runaway loop: the plugin's import of a long history sends
// up to 50 sessions per request, and starts over if one fails, so it must
// fit a year of heavy use. No RateLimit headers: importers retry later.
const importLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: () => Number(process.env.AGENT_IMPORTS_PER_HOUR || 1000),
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? "anon",
  message: { error: "Too many imports from this account; try again in an hour." },
});
const maxConcurrentImports = () => Number(process.env.AGENT_IMPORTS_CONCURRENT || 2);
let importsRunning = 0;

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
    if (importsRunning >= maxConcurrentImports()) {
      throw createError("Other imports are running right now; try again in a minute.", 429);
    }
    importsRunning++;
    try {
      const ctx = contextFromRequest(req);
      res.json(await importAgentSessions(ctx, sessions, { dryRun, afterTrackedWork }));
    } finally {
      importsRunning--;
    }
  })
);

export default router;
