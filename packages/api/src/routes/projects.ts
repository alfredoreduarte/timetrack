import express from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";

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
  hourlyRate: z.number().positive().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").optional(),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, "Invalid color format")
    .optional(),
  hourlyRate: z.number().positive().optional(),
  isActive: z.boolean().optional(),
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

    const where: any = {
      userId: req.user!.id,
    };

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        hourlyRate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            tasks: true,
            timeEntries: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
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
    const { name, description, color, hourlyRate } = createProjectSchema.parse(
      req.body
    );

    const project = await prisma.project.create({
      data: {
        name,
        description,
        color: color || "#3B82F6",
        hourlyRate,
        userId: req.user!.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        hourlyRate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("project-created", project);

    res.status(201).json({
      message: "Project created successfully",
      project,
    });
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
    const { id } = req.params;
    const updateData = updateProjectSchema.parse(req.body);

    // Check if project exists and belongs to user
    const existingProject = await prisma.project.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!existingProject) {
      throw createError("Project not found", 404);
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        hourlyRate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("project-updated", project);

    res.json({
      message: "Project updated successfully",
      project,
    });
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
    const { id } = req.params;

    // Check if project exists and belongs to user
    const existingProject = await prisma.project.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!existingProject) {
      throw createError("Project not found", 404);
    }

    // Delete the project (this will set projectId to null for associated time entries due to onDelete: SetNull)
    await prisma.project.delete({
      where: { id },
    });

    // Clean up orphaned time entries that belong to this user and have null projectId
    // This prevents them from affecting dashboard earnings calculations
    await prisma.timeEntry.deleteMany({
      where: {
        userId: req.user!.id,
        projectId: null,
        taskId: null, // Only delete entries that are completely orphaned
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("project-deleted", { id });

    res.json({
      message: "Project deleted successfully",
    });
  })
);

export default router;
