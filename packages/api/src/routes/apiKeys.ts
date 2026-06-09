import express from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import {
  authenticate,
  requireJwt,
  AuthenticatedRequest,
} from "../middleware/auth";
import { generateApiKey } from "../utils/apiKeys";

const router = express.Router();

const MAX_KEYS_PER_USER = 10;

router.use(authenticate);
// Managing keys requires an interactive session — keys cannot manage themselves.
router.use(requireJwt);

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  expiresAt: z
    .string()
    .datetime({ message: "expiresAt must be ISO 8601" })
    .refine((v) => new Date(v) > new Date(), {
      message: "expiresAt must be in the future",
    })
    .optional(),
});

const apiKeySelect = {
  id: true,
  name: true,
  keyPrefix: true,
  isActive: true,
  lastUsedAt: true,
  createdAt: true,
  expiresAt: true,
} as const;

/**
 * @swagger
 * /api-keys:
 *   get:
 *     summary: List the current user's API keys
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API keys retrieved
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: req.user!.id },
      select: apiKeySelect,
      orderBy: { createdAt: "desc" },
    });
    res.json({ apiKeys });
  })
);

/**
 * @swagger
 * /api-keys:
 *   post:
 *     summary: Create a new API key. The plaintext token is returned ONCE.
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: API key created — token returned once
 *       400:
 *         description: Validation error or limit reached
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { name, expiresAt } = createSchema.parse(req.body);
    const { token, hash, prefix } = generateApiKey();

    const apiKey = await prisma.$transaction(async (tx: typeof prisma) => {
      const activeCount = await tx.apiKey.count({
        where: { userId: req.user!.id, isActive: true },
      });
      if (activeCount >= MAX_KEYS_PER_USER) {
        throw createError(
          `You can have at most ${MAX_KEYS_PER_USER} active API keys`,
          400
        );
      }
      return tx.apiKey.create({
        data: {
          userId: req.user!.id,
          name: name.trim(),
          keyHash: hash,
          keyPrefix: prefix,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        select: apiKeySelect,
      });
    });

    res.set("Cache-Control", "no-store");
    res.status(201).json({
      message: "API key created. Store the token securely — it will not be shown again.",
      apiKey,
      token,
    });
  })
);

/**
 * @swagger
 * /api-keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     tags: [ApiKeys]
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
 *         description: API key revoked
 *       404:
 *         description: API key not found
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    const existing = await prisma.apiKey.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!existing) {
      throw createError("API key not found", 404);
    }

    await prisma.apiKey.delete({ where: { id } });

    res.json({ message: "API key revoked" });
  })
);

export default router;
