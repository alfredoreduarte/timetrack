import express from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

const MAX_FAVORITES = 5;

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const createFavoriteSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  taskId: z.string().optional(),
  description: z.string().max(200, "Description must be 200 characters or less").optional(),
});

// Select fields for consistent response shape
const favoriteSelect = {
  id: true,
  displayOrder: true,
  description: true,
  userId: true,
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
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * @swagger
 * /favorites:
 *   get:
 *     summary: List all favorites for the authenticated user
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorites retrieved successfully
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      select: favoriteSelect,
      orderBy: { displayOrder: "asc" },
    });

    res.json({ favorites });
  })
);

/**
 * @swagger
 * /favorites:
 *   post:
 *     summary: Create a new favorite
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *             properties:
 *               projectId:
 *                 type: string
 *               taskId:
 *                 type: string
 *               description:
 *                 type: string
 *                 maxLength: 200
 *     responses:
 *       201:
 *         description: Favorite created successfully
 *       400:
 *         description: Maximum favorites limit reached
 *       409:
 *         description: Duplicate favorite
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { projectId, taskId, description } = createFavoriteSchema.parse(req.body);

    // Normalize description
    const normalizedDescription = description?.trim() || null;

    // Verify project exists and belongs to user
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user!.id },
    });
    if (!project) {
      throw createError("Project not found", 404);
    }

    // Verify task if provided
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId: req.user!.id, projectId },
      });
      if (!task) {
        throw createError("Task not found", 404);
      }
    }

    // Use transaction for atomicity (count check + create)
    const favorite = await prisma.$transaction(async (tx: typeof prisma) => {
      const count = await tx.favorite.count({
        where: { userId: req.user!.id },
      });
      if (count >= MAX_FAVORITES) {
        throw createError("Maximum of 5 favorites allowed", 400);
      }

      // Check for duplicate
      const existing = await tx.favorite.findFirst({
        where: {
          userId: req.user!.id,
          projectId,
          taskId: taskId || null,
          description: normalizedDescription,
        },
      });
      if (existing) {
        throw createError("This combination is already a favorite", 409);
      }

      // Get next display order
      const maxOrder = await tx.favorite.aggregate({
        where: { userId: req.user!.id },
        _max: { displayOrder: true },
      });
      const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

      return tx.favorite.create({
        data: {
          userId: req.user!.id,
          projectId,
          taskId: taskId || null,
          description: normalizedDescription,
          displayOrder: nextOrder,
        },
        select: favoriteSelect,
      });
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("favorite-created", favorite);

    res.status(201).json({
      message: "Favorite created successfully",
      favorite,
    });
  })
);

/**
 * @swagger
 * /favorites/{id}:
 *   delete:
 *     summary: Remove a favorite
 *     tags: [Favorites]
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
 *         description: Favorite deleted successfully
 *       404:
 *         description: Favorite not found
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    // Check ownership
    const existing = await prisma.favorite.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!existing) {
      throw createError("Favorite not found", 404);
    }

    await prisma.favorite.delete({ where: { id } });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("favorite-deleted", { id });

    res.json({
      message: "Favorite deleted successfully",
    });
  })
);

export default router;
