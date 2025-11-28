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
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
});

const stopTimeEntrySchema = z.object({
  endTime: z.string().datetime().optional(),
});

const createTimeEntrySchema = z.object({
  description: z.string().nullable().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
});

const updateTimeEntrySchema = z.object({
  description: z.string().nullable().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  hours: z.number().positive().optional(), // New: Set duration by hours
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
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
    if (task?.hourlyRate !== null && task?.hourlyRate !== undefined) return task.hourlyRate;
  }

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { hourlyRate: true },
    });
    if (project?.hourlyRate !== null && project?.hourlyRate !== undefined) return project.hourlyRate;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultHourlyRate: true },
  });

  return user?.defaultHourlyRate !== null && user?.defaultHourlyRate !== undefined ? user.defaultHourlyRate : null;
}

/**
 * @swagger
 * /time-entries:
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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Time entries retrieved successfully
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
      projectId,
      isRunning,
      startDate,
      endDate,
      page = "1",
      limit = "50",
    } = req.query;

    // Validate and parse pagination parameters
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(
      100,
      Math.max(1, parseInt(limit as string, 10) || 50)
    );
    const skip = (pageNum - 1) * limitNum;

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

    // Get total count for pagination
    const total = await prisma.timeEntry.count({ where });

    // Get paginated time entries
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
        projectId: true,
        taskId: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
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
      skip,
      take: limitNum,
    });

    // Calculate pagination metadata
    const pages = Math.ceil(total / limitNum);

    res.json({
      entries: timeEntries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages,
      },
    });
  })
);

/**
 * @swagger
 * /time-entries/start:
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
    const hourlyRate = await getHourlyRate(
      req.user!.id,
      projectId || undefined,
      taskId || undefined
    );

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
        projectId: true,
        taskId: true,
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
 * /time-entries/{id}/stop:
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
        projectId: true,
        taskId: true,
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
 * /time-entries/current:
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
        projectId: true,
        taskId: true,
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

    // Return 200 with null when no current entry exists
    // This follows REST conventions better than 404
    return res.json({ timeEntry: timeEntry || null });
  })
);

/**
 * @swagger
 * /time-entries:
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
    const hourlyRate = await getHourlyRate(
      req.user!.id,
      projectId || undefined,
      taskId || undefined
    );

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
 * /time-entries/{id}:
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               hours:
 *                 type: number
 *                 description: Duration in hours (will calculate endTime from startTime)
 *               projectId:
 *                 type: string
 *                 nullable: true
 *               taskId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Time entry updated successfully
 *       404:
 *         description: Time entry not found
 *       400:
 *         description: Invalid time entry data
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

    // Prevent editing running entries
    if (existingEntry.isRunning) {
      throw createError("Cannot edit a running time entry. Please stop it first.", 400);
    }

    // Validate project and task if provided
    if (updateData.projectId !== undefined) {
      if (updateData.projectId) {
        const project = await prisma.project.findFirst({
          where: {
            id: updateData.projectId,
            userId: req.user!.id,
          },
        });
        if (!project) {
          throw createError("Project not found", 404);
        }
      }
    }

    if (updateData.taskId !== undefined) {
      if (updateData.taskId) {
        const task = await prisma.task.findFirst({
          where: {
            id: updateData.taskId,
            userId: req.user!.id,
          },
        });
        if (!task) {
          throw createError("Task not found", 404);
        }
      }
    }

    // Calculate times and duration
    let startTime = updateData.startTime
      ? new Date(updateData.startTime)
      : existingEntry.startTime;
    let endTime = updateData.endTime
      ? new Date(updateData.endTime)
      : existingEntry.endTime;
    let duration = existingEntry.duration;

    // Handle hours parameter - it overrides endTime
    if (updateData.hours !== undefined) {
      if (updateData.hours <= 0 || updateData.hours > 24) {
        throw createError("Hours must be between 0 and 24", 400);
      }
      // Calculate endTime based on hours from startTime
      const durationMs = updateData.hours * 60 * 60 * 1000;
      endTime = new Date(startTime.getTime() + durationMs);
      duration = Math.floor(durationMs / 1000);
    } else if (updateData.startTime || updateData.endTime) {
      // Recalculate duration if times are updated directly
      if (endTime && endTime <= startTime) {
        throw createError("End time must be after start time", 400);
      }

      if (endTime) {
        duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      }
    }

    // Update hourly rate snapshot if project or task changed
    let hourlyRateSnapshot = existingEntry.hourlyRateSnapshot;
    if (updateData.projectId !== undefined || updateData.taskId !== undefined) {
      const projectId = updateData.projectId !== undefined ? updateData.projectId : existingEntry.projectId;
      const taskId = updateData.taskId !== undefined ? updateData.taskId : existingEntry.taskId;
      hourlyRateSnapshot = await getHourlyRate(req.user!.id, projectId || undefined, taskId || undefined);
    }

    const timeEntry = await prisma.timeEntry.update({
      where: { id },
      data: {
        description: updateData.description !== undefined ? updateData.description : existingEntry.description,
        projectId: updateData.projectId !== undefined ? updateData.projectId : existingEntry.projectId,
        taskId: updateData.taskId !== undefined ? updateData.taskId : existingEntry.taskId,
        startTime,
        endTime,
        duration,
        hourlyRateSnapshot,
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
 * /time-entries/{id}:
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
