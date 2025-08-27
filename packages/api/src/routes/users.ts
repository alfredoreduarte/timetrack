import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Helper function to validate timezone
function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to get start of day in a specific timezone
function getStartOfDayInTimezone(timezone: string): Date {
  const now = new Date();

  // Create a date object representing "now" in the user's timezone
  const nowInTimezone = new Date(now.toLocaleString("en-US", { timeZone: timezone }));

  // Get the current UTC time
  const nowUTC = new Date(now.toISOString());

  // Calculate the timezone offset
  const timezoneOffset = nowUTC.getTime() - nowInTimezone.getTime();

  // Create start of day in the user's timezone
  const startOfDayLocal = new Date(nowInTimezone);
  startOfDayLocal.setHours(0, 0, 0, 0);

  // Convert back to UTC for database queries
  return new Date(startOfDayLocal.getTime() + timezoneOffset);
}

// Helper function to get start of week in a specific timezone
function getStartOfWeekInTimezone(timezone: string): Date {
  const now = new Date();

  // Create a date object representing "now" in the user's timezone
  const nowInTimezone = new Date(now.toLocaleString("en-US", { timeZone: timezone }));

  // Get the current UTC time
  const nowUTC = new Date(now.toISOString());

  // Calculate the timezone offset
  const timezoneOffset = nowUTC.getTime() - nowInTimezone.getTime();

  // Create start of week in the user's timezone (Sunday = 0)
  const startOfWeekLocal = new Date(nowInTimezone);
  startOfWeekLocal.setDate(nowInTimezone.getDate() - nowInTimezone.getDay());
  startOfWeekLocal.setHours(0, 0, 0, 0);

  // Convert back to UTC for database queries
  return new Date(startOfWeekLocal.getTime() + timezoneOffset);
}

// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().email("Invalid email address").optional(),
  defaultHourlyRate: z.number().nonnegative().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

/**
 * @swagger
 * /users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               email:
 *                 type: string
 *                 format: email
 *               defaultHourlyRate:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error or email already exists
 */
router.put(
  "/profile",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const updateData = updateProfileSchema.parse(req.body);

    // Check if email is being updated and if it's already taken
    if (updateData.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: updateData.email },
      });

      if (existingUser && existingUser.id !== req.user!.id) {
        throw createError("Email is already taken", 400);
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        defaultHourlyRate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      message: "Profile updated successfully",
      user,
    });
  })
);

/**
 * @swagger
 * /users/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 */
router.post(
  "/change-password",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(
      req.body
    );

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      throw createError("User not found", 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      throw createError("Current password is incorrect", 400);
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: hashedNewPassword },
    });

    res.json({
      message: "Password changed successfully",
    });
  })
);

/**
 * @swagger
 * /users/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timezone
 *         schema:
 *           type: string
 *         description: User's timezone (e.g., 'America/New_York', 'Europe/London'). Defaults to UTC.
 *         example: America/New_York
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 */
router.get(
  "/stats",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const timezone = (req.query.timezone as string) || "UTC";

    // Validate timezone
    let userTimezone = "UTC";
    if (timezone && isValidTimezone(timezone)) {
      userTimezone = timezone;
    } else if (timezone) {
      console.warn(
        `Invalid timezone provided: ${timezone}, falling back to UTC`
      );
    }

    // Get various statistics
    const [
      totalProjects,
      activeProjects,
      totalTasks,
      completedTasks,
      totalTimeEntries,
      runningTimeEntry,
    ] = await Promise.all([
      prisma.project.count({
        where: { userId },
      }),
      prisma.project.count({
        where: { userId, isActive: true },
      }),
      prisma.task.count({
        where: { userId },
      }),
      prisma.task.count({
        where: { userId, isCompleted: true },
      }),
      prisma.timeEntry.count({
        where: { userId },
      }),
      prisma.timeEntry.findFirst({
        where: { userId, isRunning: true },
        select: {
          id: true,
          startTime: true,
          project: {
            select: {
              name: true,
              color: true,
            },
          },
          task: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    // Calculate total time tracked (in seconds)
    const totalTimeResult = await prisma.timeEntry.aggregate({
      where: {
        userId,
        isRunning: false,
      },
      _sum: {
        duration: true,
      },
    });

    const totalTimeTracked = totalTimeResult._sum.duration || 0;

    // Get time tracked this week in user's timezone
    const startOfWeek = getStartOfWeekInTimezone(userTimezone);

    const thisWeekTimeResult = await prisma.timeEntry.aggregate({
      where: {
        userId,
        isRunning: false,
        startTime: {
          gte: startOfWeek,
        },
      },
      _sum: {
        duration: true,
      },
    });

    const thisWeekTime = thisWeekTimeResult._sum.duration || 0;

    res.json({
      stats: {
        totalProjects,
        activeProjects,
        totalTasks,
        completedTasks,
        totalTimeEntries,
        totalTimeTracked, // in seconds
        thisWeekTime, // in seconds
        runningTimeEntry,
      },
    });
  })
);

/**
 * @swagger
 * /users/dashboard-earnings:
 *   get:
 *     summary: Get dashboard earnings data
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timezone
 *         schema:
 *           type: string
 *         description: User's timezone (e.g., 'America/New_York', 'Europe/London'). Defaults to UTC.
 *         example: America/New_York
 *     responses:
 *       200:
 *         description: Dashboard earnings retrieved successfully
 */
router.get(
  "/dashboard-earnings",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const timezone = (req.query.timezone as string) || "UTC";

    // Validate timezone
    let userTimezone = "UTC";
    if (timezone && isValidTimezone(timezone)) {
      userTimezone = timezone;
    } else if (timezone) {
      console.warn(
        `Invalid timezone provided: ${timezone}, falling back to UTC`
      );
    }

    // Get current running timer
    const runningEntry = await prisma.timeEntry.findFirst({
      where: { userId, isRunning: true },
      select: {
        id: true,
        startTime: true,
        hourlyRateSnapshot: true,
        project: {
          select: {
            name: true,
            hourlyRate: true,
          },
        },
        task: {
          select: {
            name: true,
            hourlyRate: true,
          },
        },
      },
    });

    // Calculate current timer earnings
    let currentTimerEarnings = 0;
    let currentTimerDuration = 0;
    if (runningEntry) {
      const startTime = new Date(runningEntry.startTime).getTime();
      const now = new Date().getTime();
      currentTimerDuration = Math.floor((now - startTime) / 1000); // in seconds
      const hourlyRate = runningEntry.hourlyRateSnapshot || 0;
      currentTimerEarnings = (hourlyRate * currentTimerDuration) / 3600; // convert seconds to hours
    }

    // Get today's earnings (start of day to now in user's timezone)
    const startOfToday = getStartOfDayInTimezone(userTimezone);

    const todayTimeEntries = await prisma.timeEntry.findMany({
      where: {
        userId,
        isRunning: false,
        projectId: {
          not: null, // Exclude orphaned time entries
        },
        startTime: {
          gte: startOfToday,
        },
      },
      select: {
        duration: true,
        hourlyRateSnapshot: true,
      },
    });

    const todayEarnings = todayTimeEntries.reduce((sum: number, entry: any) => {
      const rate = entry.hourlyRateSnapshot || 0;
      const hours = (entry.duration || 0) / 3600;
      return sum + rate * hours;
    }, 0);

    const todayDuration = todayTimeEntries.reduce(
      (sum: number, entry: any) => sum + (entry.duration || 0),
      0
    );

    // Get this week's earnings (start of week to now in user's timezone)
    const startOfWeek = getStartOfWeekInTimezone(userTimezone);

    const thisWeekTimeEntries = await prisma.timeEntry.findMany({
      where: {
        userId,
        isRunning: false,
        projectId: {
          not: null, // Exclude orphaned time entries
        },
        startTime: {
          gte: startOfWeek,
        },
      },
      select: {
        duration: true,
        hourlyRateSnapshot: true,
      },
    });

    const thisWeekEarnings = thisWeekTimeEntries.reduce(
      (sum: number, entry: any) => {
        const rate = entry.hourlyRateSnapshot || 0;
        const hours = (entry.duration || 0) / 3600;
        return sum + rate * hours;
      },
      0
    );

    const thisWeekDuration = thisWeekTimeEntries.reduce(
      (sum: number, entry: any) => sum + (entry.duration || 0),
      0
    );

    res.json({
      earnings: {
        currentTimer: {
          earnings: currentTimerEarnings,
          duration: currentTimerDuration,
          isRunning: !!runningEntry,
          hourlyRate: runningEntry?.hourlyRateSnapshot || 0,
        },
        today: {
          earnings: todayEarnings,
          duration: todayDuration,
        },
        thisWeek: {
          earnings: thisWeekEarnings,
          duration: thisWeekDuration,
        },
      },
    });
  })
);

export default router;
