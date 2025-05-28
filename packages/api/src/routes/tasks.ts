import express from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const createTaskSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  description: z.string().optional(),
  projectId: z.string(),
  hourlyRate: z.number().positive().optional(),
});

const updateTaskSchema = z.object({
  name: z.string().min(1, "Task name is required").optional(),
  description: z.string().optional(),
  isCompleted: z.boolean().optional(),
  hourlyRate: z.number().positive().optional(),
});

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get all tasks for the authenticated user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *       - in: query
 *         name: isCompleted
 *         schema:
 *           type: boolean
 *         description: Filter by completion status
 *     responses:
 *       200:
 *         description: Tasks retrieved successfully
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { projectId, isCompleted } = req.query;

    const where: any = {
      userId: req.user!.id,
    };

    if (projectId) {
      where.projectId = projectId;
    }

    if (isCompleted !== undefined) {
      where.isCompleted = isCompleted === "true";
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        isCompleted: true,
        hourlyRate: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        _count: {
          select: {
            timeEntries: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ tasks });
  })
);

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
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
 *               - projectId
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               projectId:
 *                 type: string
 *               hourlyRate:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: Task created successfully
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { name, description, projectId, hourlyRate } = createTaskSchema.parse(
      req.body
    );

    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user!.id,
      },
    });

    if (!project) {
      throw createError("Project not found", 404);
    }

    const task = await prisma.task.create({
      data: {
        name,
        description,
        projectId,
        hourlyRate,
        userId: req.user!.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isCompleted: true,
        hourlyRate: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("task-created", task);

    res.status(201).json({
      message: "Task created successfully",
      task,
    });
  })
);

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     summary: Get a specific task
 *     tags: [Tasks]
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
 *         description: Task retrieved successfully
 *       404:
 *         description: Task not found
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    const task = await prisma.task.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isCompleted: true,
        hourlyRate: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        timeEntries: {
          select: {
            id: true,
            description: true,
            startTime: true,
            endTime: true,
            duration: true,
            isRunning: true,
          },
          orderBy: {
            startTime: "desc",
          },
        },
      },
    });

    if (!task) {
      throw createError("Task not found", 404);
    }

    res.json({ task });
  })
);

/**
 * @swagger
 * /api/tasks/{id}:
 *   put:
 *     summary: Update a task
 *     tags: [Tasks]
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
 *               isCompleted:
 *                 type: boolean
 *               hourlyRate:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       404:
 *         description: Task not found
 */
router.put(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const updateData = updateTaskSchema.parse(req.body);

    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!existingTask) {
      throw createError("Task not found", 404);
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        isCompleted: true,
        hourlyRate: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("task-updated", task);

    res.json({
      message: "Task updated successfully",
      task,
    });
  })
);

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
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
 *         description: Task deleted successfully
 *       404:
 *         description: Task not found
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!existingTask) {
      throw createError("Task not found", 404);
    }

    await prisma.task.delete({
      where: { id },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("task-deleted", { id });

    res.json({
      message: "Task deleted successfully",
    });
  })
);

export default router;
