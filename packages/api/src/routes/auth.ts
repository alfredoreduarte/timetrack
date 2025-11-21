import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import svgCaptcha from "svg-captcha";
import crypto from "crypto";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { emailService } from "../utils/email";

const router = express.Router();

// Store captcha sessions in memory (in production, use Redis or database)
const captchaSessions = new Map<string, { text: string; expiresAt: number }>();

// Clean up expired captcha sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of captchaSessions.entries()) {
    if (session.expiresAt < now) {
      captchaSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

// Validation schemas
const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters long")
    .max(50, "Name must be less than 50 characters")
    .trim(),
  email: z
    .string()
    .email("Please enter a valid email address")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long")
    .max(100, "Password must be less than 100 characters"),
  defaultHourlyRate: z
    .number()
    .positive("Hourly rate must be a positive number")
    .optional(),
  idleTimeoutSeconds: z
    .number()
    .int("Idle timeout must be a whole number of seconds")
    .min(60, "Idle timeout must be at least 60 seconds (1 minute)")
    .max(7200, "Idle timeout cannot exceed 7200 seconds (120 minutes)")
    .optional(),
  captchaId: z.string().min(1, "Captcha ID is required"),
  captchaValue: z.string().min(1, "Captcha value is required"),
});

const loginSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address")
    .toLowerCase()
    .trim(),
  password: z.string().min(1, "Password is required"),
});

const requestPasswordResetSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address")
    .toLowerCase()
    .trim(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long")
    .max(100, "Password must be less than 100 characters"),
});

/**
 * @swagger
 * /auth/captcha:
 *   get:
 *     summary: Generate a new captcha challenge
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Captcha generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 captchaId:
 *                   type: string
 *                 captchaSvg:
 *                   type: string
 */
router.get(
  "/captcha",
  asyncHandler(async (req: Request, res: Response) => {
    // Generate captcha
    const captcha = svgCaptcha.create({
      size: 5, // 5 characters
      noise: 2, // 2 noise lines
      color: true, // colorful captcha
      background: "#f8f9fa", // light background
      fontSize: 50,
      width: 150,
      height: 60,
    });

    // Generate unique session ID
    const captchaId =
      Date.now().toString() + Math.random().toString(36).substr(2, 9);

    // Store captcha with expiration (5 minutes)
    captchaSessions.set(captchaId, {
      text: captcha.text.toLowerCase(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    res.json({
      captchaId,
      captchaSvg: captcha.data,
    });
  })
);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - captchaId
 *               - captchaValue
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               defaultHourlyRate:
 *                 type: number
 *                 minimum: 0
 *               idleTimeoutSeconds:
 *                 type: integer
 *                 minimum: 60
 *                 maximum: 7200
 *               captchaId:
 *                 type: string
 *                 description: Captcha session ID obtained from /auth/captcha
 *               captchaValue:
 *                 type: string
 *                 description: User's answer to the captcha challenge
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 token:
 *                   type: string
 *       400:
 *         description: Validation error, user already exists, or invalid captcha
 */
router.post(
  "/register",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      name,
      email,
      password,
      defaultHourlyRate,
      idleTimeoutSeconds,
      captchaId,
      captchaValue,
    } = registerSchema.parse(req.body);

    // Validate captcha
    const captchaSession = captchaSessions.get(captchaId);
    if (!captchaSession) {
      throw createError("Invalid or expired captcha", 400);
    }

    if (captchaSession.expiresAt < Date.now()) {
      captchaSessions.delete(captchaId);
      throw createError("Captcha has expired", 400);
    }

    if (captchaSession.text !== captchaValue.toLowerCase().trim()) {
      throw createError("Incorrect captcha value", 400);
    }

    // Remove used captcha session
    captchaSessions.delete(captchaId);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw createError("User with this email already exists", 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        defaultHourlyRate,
        idleTimeoutSeconds,
      },
      select: {
        id: true,
        name: true,
        email: true,
        defaultHourlyRate: true,
        idleTimeoutSeconds: true,
        createdAt: true,
      },
    });

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw createError("JWT secret not configured", 500);
    }

    const token = (jwt as any).sign(
      { userId: user.id, email: user.email },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      user,
      token,
    });
  })
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 token:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
router.post(
  "/login",
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw createError("Invalid credentials", 401);
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw createError("Invalid credentials", 401);
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw createError("JWT secret not configured", 500);
    }

    const token = (jwt as any).sign(
      { userId: user.id, email: user.email },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        defaultHourlyRate: user.defaultHourlyRate,
        idleTimeoutSeconds: user.idleTimeoutSeconds,
      },
      token,
    });
  })
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     defaultHourlyRate:
 *                       type: number
 *                     idleTimeoutSeconds:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        defaultHourlyRate: true,
        idleTimeoutSeconds: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ user });
  })
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/refresh",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Generate new JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw createError("JWT secret not configured", 500);
    }

    const token = (jwt as any).sign(
      { userId: req.user!.id, email: req.user!.email },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      message: "Token refreshed successfully",
      token,
    });
  })
);

/**
 * @swagger
 * /auth/request-password-reset:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent (always returns success for security)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post(
  "/request-password-reset",
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = requestPasswordResetSchema.parse(req.body);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    // but only send email if user exists
    if (user) {
      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Save reset token to database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpiresAt: resetExpiresAt,
        },
      });

      // Send password reset email
      try {
        await emailService.sendPasswordResetEmail(email, resetToken);
      } catch (error) {
        console.error('Failed to send password reset email:', error);
        // Don't throw error to prevent information disclosure
      }
    }

    res.json({
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  })
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token received via email
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: New password
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 token:
 *                   type: string
 *       400:
 *         description: Invalid or expired token
 */
router.post(
  "/reset-password",
  asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = resetPasswordSchema.parse(req.body);

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiresAt: {
          gt: new Date(), // Token must not be expired
        },
      },
    });

    if (!user) {
      throw createError("Invalid or expired reset token", 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user's password and clear reset token
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        defaultHourlyRate: true,
        idleTimeoutSeconds: true,
      },
    });

    // Generate new JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw createError("JWT secret not configured", 500);
    }

    const jwtToken = (jwt as any).sign(
      { userId: updatedUser.id, email: updatedUser.email },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      message: "Password reset successful",
      user: updatedUser,
      token: jwtToken,
    });
  })
);

export default router;
