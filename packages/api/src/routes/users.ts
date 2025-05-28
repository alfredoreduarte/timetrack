import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().email("Invalid email address").optional(),
  defaultHourlyRate: z.number().positive().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

/**
 * @swagger
 * /api/users/profile:
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
 * /api/users/change-password:
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
 * /api/users/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 */
router.get(
  "/stats",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

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

    // Get time tracked this week
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

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

export default router;
