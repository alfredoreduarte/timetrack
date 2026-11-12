import express from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { listAuditEvents } from "../services/audit";
import {
  addTimerNote,
  getTimerDetail,
  listTimers,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  touchTimer,
  updateTimer,
  recordTimerUsage,
} from "../services/timers";

const router = express.Router();
router.use(authenticate);

const isoDate = z.string().datetime({ offset: true });
const atSchema = z.object({ at: isoDate.nullable().optional() }).strict();

const startSchema = z
  .object({
    description: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    taskId: z.string().nullable().optional(),
    sessionKey: z.string().nullable().optional(),
    agent: z.string().nullable().optional(),
    cwd: z.string().nullable().optional(),
    gitRemote: z.string().nullable().optional(),
    gitBranch: z.string().nullable().optional(),
    idleTimeoutSeconds: z.number().int().nullable().optional(),
    isAiGenerated: z.boolean().optional(),
    startedAt: isoDate.nullable().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    description: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    taskId: z.string().nullable().optional(),
    idleTimeoutSeconds: z.number().int().nullable().optional(),
    isAiGenerated: z.boolean().optional(),
    rememberRepo: z.boolean().optional(),
  })
  .strict();

const listSchema = z.object({
  status: z.enum(["running", "paused", "stopped", "active", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const noteSchema = z.object({ body: z.string().min(1).max(4000) }).strict();

const tokenCounts = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    cacheReadTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
  })
  .strict();
const usageSchema = z
  .object({
    usage: z.record(z.string().min(1).max(100), tokenCounts),
    mode: z.enum(["replace", "add"]).optional(),
  })
  .strict();

/**
 * @swagger
 * /timers:
 *   get:
 *     summary: "List timers (default: running + paused)"
 *     tags: [Timers]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [running, paused, stopped, active, all] } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 200 } }
 *   post:
 *     summary: Start a timer (idempotent when sessionKey is given)
 *     description: An existing timer with the same sessionKey is returned if running, or resumed if paused/stopped.
 *     tags: [Timers]
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const opts = listSchema.parse(req.query);
    res.json({ timers: await listTimers(contextFromRequest(req), opts) });
  })
);

router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = startSchema.parse(req.body);
    const result = await startTimer(contextFromRequest(req), input);
    res.status(result.created ? 201 : 200).json(result);
  })
);

/**
 * @swagger
 * /timers/{id}:
 *   get:
 *     summary: Timer with its segments and notes
 *     tags: [Timers]
 *   patch:
 *     summary: "Reassign project, task, description or AI flag (applies to all segments)"
 *     tags: [Timers]
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json({ timer: await getTimerDetail(contextFromRequest(req), req.params.id) });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = updateSchema.parse(req.body);
    res.json(await updateTimer(contextFromRequest(req), req.params.id, input));
  })
);

/**
 * @swagger
 * /timers/{id}/pause:
 *   post: { summary: "Pause (optional `at` to backdate)", tags: [Timers] }
 * /timers/{id}/resume:
 *   post: { summary: Resume, tags: [Timers] }
 * /timers/{id}/stop:
 *   post: { summary: "Stop (optional `at`)", tags: [Timers] }
 * /timers/{id}/heartbeat:
 *   post: { summary: "Record agent activity; resumes idle-paused timers", tags: [Timers] }
 * /timers/{id}/notes:
 *   post: { summary: Append a work-log note, tags: [Timers] }
 * /timers/{id}/history:
 *   get: { summary: Audit trail for the timer, tags: [Timers] }
 */
router.post(
  "/:id/pause",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { at } = atSchema.parse(req.body ?? {});
    res.json(await pauseTimer(contextFromRequest(req), req.params.id, { at, reason: "manual" }));
  })
);

router.post(
  "/:id/resume",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { at } = atSchema.parse(req.body ?? {});
    res.json(await resumeTimer(contextFromRequest(req), req.params.id, { at }));
  })
);

router.post(
  "/:id/stop",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { at } = atSchema.parse(req.body ?? {});
    res.json(await stopTimer(contextFromRequest(req), req.params.id, { at }));
  })
);

router.post(
  "/:id/heartbeat",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { at } = atSchema.parse(req.body ?? {});
    res.json(await touchTimer(contextFromRequest(req), req.params.id, { at }));
  })
);

router.post(
  "/:id/notes",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { body } = noteSchema.parse(req.body);
    res.status(201).json({ note: await addTimerNote(contextFromRequest(req), req.params.id, body) });
  })
);

/**
 * @swagger
 * /timers/{id}/usage:
 *   post:
 *     summary: Report the agent's token usage per model (API-equivalent cost is computed)
 *     tags: [Timers]
 */
router.post(
  "/:id/usage",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { usage, mode } = usageSchema.parse(req.body);
    res.json(await recordTimerUsage(contextFromRequest(req), req.params.id, usage, mode));
  })
);

router.get(
  "/:id/history",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ctx = contextFromRequest(req);
    await getTimerDetail(ctx, req.params.id); // ownership check
    res.json({ events: await listAuditEvents(ctx, "timer", req.params.id) });
  })
);

export default router;
