import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { classifyAgentEvent, handleAgentEvent } from "../services/agentEvents";

const router = express.Router();
router.use(authenticate);

// Hooks fire on every tool call of every parallel agent; this only stops a
// runaway loop. Keyed by user, not IP.
router.use(
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.AGENT_EVENTS_PER_MINUTE || 3000),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? "anon",
    message: { error: "Too many agent events, slow down." },
  })
);

const str = z.string().max(2000).nullable().optional();
/**
 * Repo metadata is best effort: a value too long to store (a 300-char
 * branch, say) is dropped rather than failing the event, so it can never
 * stop a session from being tracked.
 */
const meta = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => (typeof v === "string" && v.length > max ? null : v));

// Accepts the generic shape and the native Claude Code / Cursor hook field
// names. Everything else in the body (prompts, tool input/output, messages)
// is ignored and never stored.
const eventSchema = z.object({
  event: str,
  hook_event_name: str,
  hookEventName: str,
  sessionKey: str,
  session_id: str,
  conversation_id: str,
  agent: str,
  cwd: meta(1000),
  workspace_roots: z.array(z.string().max(2000)).max(20).optional(),
  gitRemote: meta(500),
  git_remote: meta(500),
  gitBranch: meta(255),
  git_branch: meta(255),
  source: str,
  reason: str,
});

const VIA_FROM_AGENT = new Set(["claude_code", "cursor", "codex"]);

/**
 * @swagger
 * /agent-events:
 *   post:
 *     summary: Ingest an agent lifecycle event (Claude Code / Cursor hooks or generic)
 *     description: |
 *       session_start starts or resumes the session's timer; any activity event
 *       (prompt, tool use, turn end, notification) is a heartbeat; session_end
 *       stops it. Accepts native Claude Code hook fields (hook_event_name,
 *       session_id, cwd). With ?format=claude-code the response is Claude Code
 *       hook output that tells the agent its timer id and project. Plan limits
 *       never fail the request — they come back as action "not_tracked".
 *     tags: [Agents]
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const b = eventSchema.parse(req.body ?? {});
    const event = b.event ?? b.hook_event_name ?? b.hookEventName ?? "";
    // Cursor payloads also carry hook_event_name, so check its
    // conversation_id first.
    const agent =
      b.agent?.trim().toLowerCase() ||
      (b.conversation_id ? "cursor" : b.hook_event_name ? "claude_code" : null);

    const ctx = contextFromRequest(req);
    if (!req.headers["x-client"] && agent && VIA_FROM_AGENT.has(agent)) ctx.via = agent;
    // Agent sessions are AI work unless the client explicitly says otherwise.
    const isAiGenerated = req.headers["x-ai-generated"] !== undefined ? ctx.aiDefault : true;

    const result = await handleAgentEvent(
      ctx,
      {
        event,
        sessionKey: b.sessionKey ?? b.session_id ?? b.conversation_id ?? "",
        agent,
        cwd: b.cwd ?? b.workspace_roots?.[0] ?? null,
        gitRemote: b.gitRemote ?? b.git_remote ?? null,
        gitBranch: b.gitBranch ?? b.git_branch ?? null,
        source: b.source,
        reason: b.reason,
      },
      {
        appUrl: process.env.APPLICATION_URL || "http://localhost:3010",
        isAiGenerated,
      }
    );

    if (req.query.format === "claude-code") {
      const kind = classifyAgentEvent(event);
      if (kind === "session_start" && result.context) {
        return res.json({
          hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: result.context },
        });
      }
      return res.json({});
    }
    return res.json(result);
  })
);

export default router;
