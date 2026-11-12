import express from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { deleteTask } from "../services/deletions";
import { createTask, listTasks, updateTask } from "../services/catalog";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const createTaskSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  description: z.string().optional(),
  projectId: z.string(),
  hourlyRate: z.number().nonnegative().optional(),
});

const updateTaskSchema = z.object({
  name: z.string().min(1, "Task name is required").optional(),
  description: z.string().optional(),
  isCompleted: z.boolean().optional(),
  hourlyRate: z.union([z.number().nonnegative(), z.null()]).optional(),
});

/**
 * @swagger
 * /tasks:
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
    const tasks = await listTasks(contextFromRequest(req), {
      projectId: typeof projectId === "string" && projectId ? projectId : undefined,
      isCompleted: isCompleted === undefined ? undefined : isCompleted === "true",
    });
    res.json({ tasks });
  })
);

/**
 * @swagger
 * /tasks:
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
    const input = createTaskSchema.parse(req.body);
    const task = await createTask(contextFromRequest(req), input);
    res.status(201).json({ message: "Task created successfully", task });
  })
);

/**
 * @swagger
 * /tasks/{id}:
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
 * /tasks/{id}:
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
 *                 nullable: true
 *                 description: Set to null to remove override and use project's default rate
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       404:
 *         description: Task not found
 */
router.put(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = updateTaskSchema.parse(req.body);
    const task = await updateTask(contextFromRequest(req), req.params.id, input);
    res.json({ message: "Task updated successfully", task });
  })
);

/**
 * @swagger
 * /tasks/{id}:
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
    await deleteTask(contextFromRequest(req), req.params.id);
    res.json({ message: "Task deleted successfully" });
  })
);

export default router;
