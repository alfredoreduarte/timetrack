import express from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { importAgentSessions, MAX_IMPORT_SESSIONS, MAX_SPANS_PER_SESSION } from "../services/imports";

const router = express.Router();
router.use(authenticate);

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
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { dryRun, afterTrackedWork, sessions } = importSchema.parse(req.body);
    const ctx = contextFromRequest(req);
    res.json(await importAgentSessions(ctx, sessions, { dryRun, afterTrackedWork }));
  })
);

export default router;
