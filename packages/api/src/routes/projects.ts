import express from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { deleteProject } from "../services/deletions";
import { createProject, listProjects, updateProject } from "../services/catalog";
import { resolveProjectForRepo } from "../services/repos";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, "Invalid color format")
    .optional(),
  hourlyRate: z.number().nonnegative().optional(),
  repoPatterns: z.array(z.string()).max(50).optional(),
  overlapMode: z.enum(["dedupe", "sum"]).nullable().optional(),
  agentHourlyRate: z.number().nonnegative().nullable().optional(),
  includeAiCosts: z.boolean().optional(),
  aiCostMarkupPercent: z.number().min(0).max(100).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").optional(),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, "Invalid color format")
    .optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
  repoPatterns: z.array(z.string()).max(50).optional(),
  overlapMode: z.enum(["dedupe", "sum"]).nullable().optional(),
  agentHourlyRate: z.number().nonnegative().nullable().optional(),
  includeAiCosts: z.boolean().optional(),
  aiCostMarkupPercent: z.number().min(0).max(100).optional(),
});

const resolveSchema = z.object({
  gitRemote: z.string().max(500).nullable().optional(),
  cwd: z.string().max(1000).nullable().optional(),
});

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: Get all projects for the authenticated user
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       color:
 *                         type: string
 *                       hourlyRate:
 *                         type: number
 *                       isActive:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { isActive } = req.query;
    const projects = await listProjects(contextFromRequest(req), {
      isActive: isActive === undefined ? undefined : isActive === "true",
    });
    res.json({ projects });
  })
);

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               color:
 *                 type: string
 *                 pattern: '^#[0-9A-F]{6}$'
 *               hourlyRate:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: Project created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = createProjectSchema.parse(req.body);
    const project = await createProject(contextFromRequest(req), input);
    res.status(201).json({ message: "Project created successfully", project });
  })
);

/**
 * @swagger
 * /projects/resolve:
 *   post:
 *     summary: Find the project a repository belongs to (by git remote or path)
 *     tags: [Projects]
 */
router.post(
  "/resolve",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const repo = resolveSchema.parse(req.body);
    const match = await resolveProjectForRepo(prisma, req.user!.id, repo);
    res.json({ project: match?.project ?? null, matchedPattern: match?.pattern ?? null });
  })
);

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     summary: Get a specific project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project retrieved successfully
 *       404:
 *         description: Project not found
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        hourlyRate: true,
        repoPatterns: true,
        overlapMode: true,
        agentHourlyRate: true,
        includeAiCosts: true,
        aiCostMarkupPercent: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        tasks: {
          select: {
            id: true,
            name: true,
            description: true,
            isCompleted: true,
            hourlyRate: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            timeEntries: true,
          },
        },
      },
    });

    if (!project) {
      throw createError("Project not found", 404);
    }

    res.json({ project });
  })
);

/**
 * @swagger
 * /projects/{id}:
 *   put:
 *     summary: Update a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               color:
 *                 type: string
 *                 pattern: '^#[0-9A-F]{6}$'
 *               hourlyRate:
 *                 type: number
 *                 minimum: 0
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       404:
 *         description: Project not found
 */
router.put(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = updateProjectSchema.parse(req.body);
    const project = await updateProject(contextFromRequest(req), req.params.id, input);
    res.json({ message: "Project updated successfully", project });
  })
);

/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *       404:
 *         description: Project not found
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await deleteProject(contextFromRequest(req), req.params.id);
    res.json({ message: "Project deleted successfully" });
  })
);

export default router;
