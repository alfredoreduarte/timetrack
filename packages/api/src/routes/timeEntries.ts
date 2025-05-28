import express, { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const startTimeEntrySchema = z.object({
  description: z.string().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
});

const stopTimeEntrySchema = z.object({
  endTime: z.string().datetime().optional(),
});

const createTimeEntrySchema = z.object({
  description: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
});

const updateTimeEntrySchema = z.object({
  description: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
});

// Helper function to calculate hourly rate
async function getHourlyRate(
  userId: string,
  projectId?: string,
  taskId?: string
): Promise<number | null> {
  // Priority: Task rate > Project rate > User default rate
  if (taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { hourlyRate: true },
    });
    if (task?.hourlyRate) return task.hourlyRate;
  }

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { hourlyRate: true },
    });
    if (project?.hourlyRate) return project.hourlyRate;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultHourlyRate: true },
  });

  return user?.defaultHourlyRate || null;
}

/**
 * @swagger
 * /api/time-entries:
 *   get:
 *     summary: Get time entries for the authenticated user
 *     tags: [Time Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *       - in: query
 *         name: isRunning
 *         schema:
 *           type: boolean
 *         description: Filter by running status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter entries from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter entries until this date
 *     responses:
 *       200:
 *         description: Time entries retrieved successfully
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { projectId, isRunning, startDate, endDate } = req.query;

    const where: any = {
      userId: req.user!.id,
    };

    if (projectId) {
      where.projectId = projectId;
    }

    if (isRunning !== undefined) {
      where.isRunning = isRunning === "true";
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate as string);
      }
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        isRunning: true,
        hourlyRateSnapshot: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startTime: "desc",
      },
    });

    res.json({ timeEntries });
  })
);

/**
 * @swagger
 * /api/time-entries/start:
 *   post:
 *     summary: Start a new time entry
 *     tags: [Time Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               projectId:
 *                 type: string
 *               taskId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Time entry started successfully
 *       400:
 *         description: Another time entry is already running
 */
router.post(
  "/start",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { description, projectId, taskId } = startTimeEntrySchema.parse(
      req.body
    );

    // Check if user has any running time entries
    const runningEntry = await prisma.timeEntry.findFirst({
      where: {
        userId: req.user!.id,
        isRunning: true,
      },
    });

    if (runningEntry) {
      throw createError(
        "You already have a running time entry. Please stop it first.",
        400
      );
    }

    // Validate project and task belong to user
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: req.user!.id,
        },
      });
      if (!project) {
        throw createError("Project not found", 404);
      }
    }

    if (taskId) {
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          userId: req.user!.id,
        },
      });
      if (!task) {
        throw createError("Task not found", 404);
      }
    }

    // Get hourly rate
    const hourlyRate = await getHourlyRate(req.user!.id, projectId, taskId);

    const timeEntry = await prisma.timeEntry.create({
      data: {
        description,
        startTime: new Date(),
        projectId,
        taskId,
        userId: req.user!.id,
        hourlyRateSnapshot: hourlyRate,
      },
      select: {
        id: true,
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        isRunning: true,
        hourlyRateSnapshot: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("time-entry-started", timeEntry);

    res.status(201).json({
      message: "Time entry started successfully",
      timeEntry,
    });
  })
);

/**
 * @swagger
 * /api/time-entries/{id}/stop:
 *   post:
 *     summary: Stop a running time entry
 *     tags: [Time Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Time entry stopped successfully
 *       404:
 *         description: Time entry not found
 *       400:
 *         description: Time entry is not running
 */
router.post(
  "/:id/stop",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { endTime } = stopTimeEntrySchema.parse(req.body);

    const timeEntry = await prisma.timeEntry.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!timeEntry) {
      throw createError("Time entry not found", 404);
    }

    if (!timeEntry.isRunning) {
      throw createError("Time entry is not running", 400);
    }

    const stopTime = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor(
      (stopTime.getTime() - timeEntry.startTime.getTime()) / 1000
    );

    const updatedTimeEntry = await prisma.timeEntry.update({
      where: { id },
      data: {
        endTime: stopTime,
        duration,
        isRunning: false,
      },
      select: {
        id: true,
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        isRunning: true,
        hourlyRateSnapshot: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("time-entry-stopped", updatedTimeEntry);

    res.json({
      message: "Time entry stopped successfully",
      timeEntry: updatedTimeEntry,
    });
  })
);

/**
 * @swagger
 * /api/time-entries/current:
 *   get:
 *     summary: Get currently running time entry
 *     tags: [Time Entries]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current time entry retrieved successfully
 *       404:
 *         description: No running time entry found
 */
router.get(
  "/current",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const timeEntry = await prisma.timeEntry.findFirst({
      where: {
        userId: req.user!.id,
        isRunning: true,
      },
      select: {
        id: true,
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        isRunning: true,
        hourlyRateSnapshot: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!timeEntry) {
      return res.status(404).json({
        message: "No running time entry found",
      });
    }

    return res.json({ timeEntry });
  })
);

/**
 * @swagger
 * /api/time-entries:
 *   post:
 *     summary: Create a manual time entry
 *     tags: [Time Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startTime
 *               - endTime
 *             properties:
 *               description:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               projectId:
 *                 type: string
 *               taskId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Time entry created successfully
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { description, startTime, endTime, projectId, taskId } =
      createTimeEntrySchema.parse(req.body);

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      throw createError("End time must be after start time", 400);
    }

    // Validate project and task belong to user
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: req.user!.id,
        },
      });
      if (!project) {
        throw createError("Project not found", 404);
      }
    }

    if (taskId) {
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          userId: req.user!.id,
        },
      });
      if (!task) {
        throw createError("Task not found", 404);
      }
    }

    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    const hourlyRate = await getHourlyRate(req.user!.id, projectId, taskId);

    const timeEntry = await prisma.timeEntry.create({
      data: {
        description,
        startTime: start,
        endTime: end,
        duration,
        isRunning: false,
        projectId,
        taskId,
        userId: req.user!.id,
        hourlyRateSnapshot: hourlyRate,
      },
      select: {
        id: true,
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        isRunning: true,
        hourlyRateSnapshot: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("time-entry-created", timeEntry);

    res.status(201).json({
      message: "Time entry created successfully",
      timeEntry,
    });
  })
);

/**
 * @swagger
 * /api/time-entries/{id}:
 *   put:
 *     summary: Update a time entry
 *     tags: [Time Entries]
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
 *         description: Time entry updated successfully
 *       404:
 *         description: Time entry not found
 */
router.put(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const updateData = updateTimeEntrySchema.parse(req.body);

    const existingEntry = await prisma.timeEntry.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!existingEntry) {
      throw createError("Time entry not found", 404);
    }

    // Calculate new duration if times are updated
    let duration = existingEntry.duration;
    if (updateData.startTime || updateData.endTime) {
      const start = updateData.startTime
        ? new Date(updateData.startTime)
        : existingEntry.startTime;
      const end = updateData.endTime
        ? new Date(updateData.endTime)
        : existingEntry.endTime;

      if (end && end <= start) {
        throw createError("End time must be after start time", 400);
      }

      if (end) {
        duration = Math.floor((end.getTime() - start.getTime()) / 1000);
      }
    }

    const timeEntry = await prisma.timeEntry.update({
      where: { id },
      data: {
        ...updateData,
        ...(updateData.startTime && {
          startTime: new Date(updateData.startTime),
        }),
        ...(updateData.endTime && { endTime: new Date(updateData.endTime) }),
        duration,
      },
      select: {
        id: true,
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        isRunning: true,
        hourlyRateSnapshot: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("time-entry-updated", timeEntry);

    res.json({
      message: "Time entry updated successfully",
      timeEntry,
    });
  })
);

/**
 * @swagger
 * /api/time-entries/{id}:
 *   delete:
 *     summary: Delete a time entry
 *     tags: [Time Entries]
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
 *         description: Time entry deleted successfully
 *       404:
 *         description: Time entry not found
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    const existingEntry = await prisma.timeEntry.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!existingEntry) {
      throw createError("Time entry not found", 404);
    }

    await prisma.timeEntry.delete({
      where: { id },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("time-entry-deleted", { id });

    res.json({
      message: "Time entry deleted successfully",
    });
  })
);

export default router;
