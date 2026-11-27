import express from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { startTimer, entrySelect } from "../services/timers";
import {
  bulkUpdateEntries,
  createEntry,
  deleteEntry,
  getEntry,
  getEntryHistory,
  listEntries,
  stopEntry,
  updateEntry,
} from "../services/entries";

const router = express.Router();

router.use(authenticate);

const isoDate = z.string().datetime({ offset: true });

const startTimeEntrySchema = z.object({
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
});

const stopTimeEntrySchema = z.object({
  endTime: isoDate.optional(),
});

const createTimeEntrySchema = z.object({
  description: z.string().nullable().optional(),
  startTime: isoDate,
  endTime: isoDate,
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  isAiGenerated: z.boolean().optional(),
  timerId: z.string().nullable().optional(),
});

const updateTimeEntrySchema = z.object({
  description: z.string().nullable().optional(),
  startTime: isoDate.optional(),
  endTime: isoDate.optional(),
  hours: z.number().positive().optional(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  isAiGenerated: z.boolean().optional(),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  set: z
    .object({
      description: z.string().nullable().optional(),
      projectId: z.string().nullable().optional(),
      taskId: z.string().nullable().optional(),
      isAiGenerated: z.boolean().optional(),
    })
    .strict(),
});

const boolParam = (v: unknown) => (v === undefined ? undefined : v === "true");
const dateParam = (v: unknown) => {
  if (typeof v !== "string" || !v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * @swagger
 * /time-entries:
 *   get:
 *     summary: List time entries (most recent first)
 *     tags: [Time Entries]
 *     parameters:
 *       - { in: query, name: projectId, schema: { type: string } }
 *       - { in: query, name: taskId, schema: { type: string } }
 *       - { in: query, name: timerId, schema: { type: string } }
 *       - { in: query, name: isRunning, schema: { type: boolean } }
 *       - { in: query, name: isAiGenerated, schema: { type: boolean } }
 *       - { in: query, name: createdVia, schema: { type: string } }
 *       - { in: query, name: startDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: endDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 50, maximum: 100 } }
 *     responses:
 *       200: { description: "{ entries, pagination }" }
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const q = req.query;
    const result = await listEntries(contextFromRequest(req), {
      projectId: typeof q.projectId === "string" ? q.projectId : undefined,
      taskId: typeof q.taskId === "string" ? q.taskId : undefined,
      timerId: typeof q.timerId === "string" ? q.timerId : undefined,
      createdVia: typeof q.createdVia === "string" ? q.createdVia : undefined,
      isRunning: boolParam(q.isRunning),
      isAiGenerated: boolParam(q.isAiGenerated),
      startDate: dateParam(q.startDate),
      endDate: dateParam(q.endDate),
      page: parseInt(q.page as string, 10) || 1,
      limit: parseInt(q.limit as string, 10) || 50,
    });
    res.json(result);
  })
);

/**
 * @swagger
 * /time-entries/start:
 *   post:
 *     summary: Start a timer (legacy shape — returns the running entry)
 *     description: Creates a pausable timer and its first segment. Concurrent timers are allowed.
 *     tags: [Time Entries]
 *     responses:
 *       201: { description: "{ message, timeEntry }" }
 *       429: { description: Concurrent running timer limit reached }
 */
router.post(
  "/start",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = startTimeEntrySchema.parse(req.body);
    const result = await startTimer(contextFromRequest(req), input);
    res.status(201).json({
      message: "Time entry started successfully",
      timeEntry: result.entry,
    });
  })
);

/**
 * @swagger
 * /time-entries/{id}/stop:
 *   post:
 *     summary: Stop a running entry (stops its timer)
 *     tags: [Time Entries]
 *     responses:
 *       200: { description: "{ message, timeEntry }" }
 *       400: { description: Not running, or endTime before start }
 *       404: { description: Not found }
 */
router.post(
  "/:id/stop",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { endTime } = stopTimeEntrySchema.parse(req.body ?? {});
    const timeEntry = await stopEntry(contextFromRequest(req), req.params.id, { endTime });
    res.json({ message: "Time entry stopped successfully", timeEntry });
  })
);

/**
 * @swagger
 * /time-entries/current:
 *   get:
 *     summary: Most recently started running entry (legacy single-timer endpoint)
 *     description: Deprecated — use /time-entries/running or /timers. Concurrent timers are supported.
 *     tags: [Time Entries]
 */
router.get(
  "/current",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const timeEntry = await prisma.timeEntry.findFirst({
      where: { userId: req.user!.id, isRunning: true },
      orderBy: { startTime: "desc" },
      select: entrySelect,
    });
    res.set("Deprecation", "true");
    res.set("Link", '</time-entries/running>; rel="successor-version"');
    res.json({ timeEntry: timeEntry || null });
  })
);

/**
 * @swagger
 * /time-entries/running:
 *   get:
 *     summary: All running entries, most recently started first
 *     tags: [Time Entries]
 */
router.get(
  "/running",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const timeEntries = await prisma.timeEntry.findMany({
      where: { userId: req.user!.id, isRunning: true },
      orderBy: { startTime: "desc" },
      select: entrySelect,
    });
    res.json({ timeEntries });
  })
);

/**
 * @swagger
 * /time-entries/bulk-update:
 *   post:
 *     summary: Reassign many entries at once (project, task, description, AI flag)
 *     tags: [Time Entries]
 */
router.post(
  "/bulk-update",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = bulkUpdateSchema.parse(req.body);
    res.json(await bulkUpdateEntries(contextFromRequest(req), input));
  })
);

/**
 * @swagger
 * /time-entries:
 *   post:
 *     summary: Create a closed entry (manual backfill, max 24h)
 *     tags: [Time Entries]
 *     responses:
 *       201: { description: "{ message, timeEntry }" }
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = createTimeEntrySchema.parse(req.body);
    const timeEntry = await createEntry(contextFromRequest(req), input);
    res.status(201).json({ message: "Time entry created successfully", timeEntry });
  })
);

/**
 * @swagger
 * /time-entries/{id}:
 *   get:
 *     summary: Get one entry
 *     tags: [Time Entries]
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const timeEntry = await getEntry(contextFromRequest(req), req.params.id);
    res.json({ timeEntry });
  })
);

/**
 * @swagger
 * /time-entries/{id}/history:
 *   get:
 *     summary: Audit trail for an entry (who changed what, via which client)
 *     tags: [Time Entries]
 */
router.get(
  "/:id/history",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const events = await getEntryHistory(contextFromRequest(req), req.params.id);
    res.json({ events });
  })
);

/**
 * @swagger
 * /time-entries/{id}:
 *   put:
 *     summary: Edit an entry
 *     description: Running entries accept description, project, task, startTime and isAiGenerated; set the end by pausing/stopping the timer. `hours` sets the end from the start.
 *     tags: [Time Entries]
 */
router.put(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const patch = updateTimeEntrySchema.parse(req.body);
    const timeEntry = await updateEntry(contextFromRequest(req), req.params.id, patch);
    res.json({ message: "Time entry updated successfully", timeEntry });
  })
);

/**
 * @swagger
 * /time-entries/{id}:
 *   delete:
 *     summary: Delete an entry (a timer's running segment pauses the timer)
 *     tags: [Time Entries]
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await deleteEntry(contextFromRequest(req), req.params.id);
    res.json({ message: "Time entry deleted successfully" });
  })
);

export default router;
