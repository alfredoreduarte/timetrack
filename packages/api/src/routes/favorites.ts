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

const updateFavoriteSchema = z.object({
  description: z.string().max(200, "Description must be 200 characters or less").optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});

const reorderFavoritesSchema = z.object({
  orderedIds: z.array(z.string()).min(1, "At least one ID is required"),
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
 * GET /favorites
 * List all favorites for the authenticated user, ordered by displayOrder
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
 * POST /favorites
 * Create a new favorite
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { projectId, taskId, description } = createFavoriteSchema.parse(req.body);

    // Normalize description
    const normalizedDescription = description?.trim() || null;

    // Check limit
    const count = await prisma.favorite.count({
      where: { userId: req.user!.id },
    });
    if (count >= MAX_FAVORITES) {
      throw createError("Maximum of 5 favorites allowed", 400);
    }

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

    // Check for duplicate
    const existing = await prisma.favorite.findFirst({
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
    const maxOrder = await prisma.favorite.aggregate({
      where: { userId: req.user!.id },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    const favorite = await prisma.favorite.create({
      data: {
        userId: req.user!.id,
        projectId,
        taskId: taskId || null,
        description: normalizedDescription,
        displayOrder: nextOrder,
      },
      select: favoriteSelect,
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
 * PUT /favorites/reorder
 * Bulk reorder all favorites (must be before /:id route)
 */
router.put(
  "/reorder",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { orderedIds } = reorderFavoritesSchema.parse(req.body);

    // Verify all IDs belong to the user
    const userFavorites = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      select: { id: true },
    });

    const userFavoriteIds = new Set(userFavorites.map((f: { id: string }) => f.id));
    const orderedIdSet = new Set(orderedIds);

    // Check that the sets match exactly
    if (orderedIds.length !== userFavorites.length) {
      throw createError(
        "orderedIds must contain exactly the same set of IDs as your current favorites",
        400
      );
    }
    for (const id of orderedIds) {
      if (!userFavoriteIds.has(id)) {
        throw createError(
          "orderedIds must contain exactly the same set of IDs as your current favorites",
          400
        );
      }
    }
    if (orderedIdSet.size !== orderedIds.length) {
      throw createError("orderedIds must not contain duplicates", 400);
    }

    // Update all display orders atomically
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.favorite.update({
          where: { id },
          data: { displayOrder: index },
        })
      )
    );

    // Fetch updated favorites
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      select: favoriteSelect,
      orderBy: { displayOrder: "asc" },
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("favorites-reordered", favorites);

    res.json({
      message: "Favorites reordered successfully",
      favorites,
    });
  })
);

/**
 * PUT /favorites/:id
 * Update a single favorite
 */
router.put(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const updateData = updateFavoriteSchema.parse(req.body);

    if (updateData.description === undefined && updateData.displayOrder === undefined) {
      throw createError("At least one field must be provided", 400);
    }

    // Check ownership
    const existing = await prisma.favorite.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!existing) {
      throw createError("Favorite not found", 404);
    }

    // Normalize description if provided
    const data: any = {};
    if (updateData.description !== undefined) {
      data.description = updateData.description.trim() || null;
    }
    if (updateData.displayOrder !== undefined) {
      data.displayOrder = updateData.displayOrder;
    }

    const favorite = await prisma.favorite.update({
      where: { id },
      data,
      select: favoriteSelect,
    });

    // Emit real-time update
    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("favorite-updated", favorite);

    res.json({
      message: "Favorite updated successfully",
      favorite,
    });
  })
);

/**
 * DELETE /favorites/:id
 * Remove a favorite
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
