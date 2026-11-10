import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import {
  createShareLink,
  getPublicTimesheet,
  listShareLinks,
  revokeShareLink,
} from "../services/shareLinks";
import { timesheetToCsv, timesheetToMarkdown } from "../billing/render";

const isoDate = z.string().datetime({ offset: true });

const createSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    projectId: z.string().nullable().optional(),
    startDate: isoDate.nullable().optional(),
    endDate: isoDate.nullable().optional(),
    rollingDays: z.number().int().nullable().optional(),
    timezone: z.string().max(100).nullable().optional(),
    showAmounts: z.boolean().optional(),
    showNotes: z.boolean().optional(),
    expiresAt: isoDate.nullable().optional(),
  })
  .strict();

/** Authenticated management of share links. */
export const shareLinksRouter = express.Router();
shareLinksRouter.use(authenticate);

/**
 * @swagger
 * /share-links:
 *   get:
 *     summary: List timesheet share links
 *     tags: [Timesheets]
 *   post:
 *     summary: Create a read-only timesheet link for a client (token shown once)
 *     tags: [Timesheets]
 * /share-links/{id}:
 *   delete:
 *     summary: Revoke a share link
 *     tags: [Timesheets]
 */
shareLinksRouter.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json({ shareLinks: await listShareLinks(contextFromRequest(req)) });
  })
);
shareLinksRouter.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = createSchema.parse(req.body);
    res.status(201).json(await createShareLink(contextFromRequest(req), input));
  })
);
shareLinksRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await revokeShareLink(contextFromRequest(req), req.params.id);
    res.json({ revoked: true });
  })
);

/** Unauthenticated, read-only client view. */
export const publicRouter = express.Router();
publicRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.PUBLIC_TIMESHEET_PER_MINUTE || 60),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests" },
  })
);

/**
 * @swagger
 * /public/timesheets/{token}:
 *   get:
 *     summary: Client view of a shared timesheet (no auth)
 *     tags: [Timesheets]
 *     parameters:
 *       - { in: query, name: format, schema: { type: string, enum: [json, markdown, csv] } }
 */
publicRouter.get(
  "/timesheets/:token",
  asyncHandler(async (req, res) => {
    const view = await getPublicTimesheet(req.params.token);
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex");
    const format = req.query.format;
    if (format === "markdown") {
      return res.type("text/markdown").send(timesheetToMarkdown(view.timesheet, { showAmounts: view.link.showAmounts }));
    }
    if (format === "csv") {
      res.setHeader("Content-Disposition", 'attachment; filename="timesheet.csv"');
      return res.type("text/csv").send(timesheetToCsv(view.timesheet, { showAmounts: view.link.showAmounts }));
    }
    return res.json(view);
  })
);
