import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/database";
import { createError } from "./errorHandler";
import { hashApiKey, isApiKeyToken } from "../utils/apiKeys";
import { logger } from "../utils/logger";

export type AuthMethod = "jwt" | "api_key";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
  authMethod?: AuthMethod;
}

const LAST_USED_DEBOUNCE_MS = 60_000;

const authenticateApiKey = async (token: string) => {
  const hash = hashApiKey(token);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (!apiKey || !apiKey.isActive) {
    throw createError("Invalid API key", 401);
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    throw createError("API key expired", 401);
  }

  const now = new Date();
  const stale =
    !apiKey.lastUsedAt ||
    now.getTime() - apiKey.lastUsedAt.getTime() > LAST_USED_DEBOUNCE_MS;
  if (stale) {
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: now } })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          `Failed to update lastUsedAt for api_key ${apiKey.id}: ${message}`
        );
      });
  }

  return apiKey.user;
};

const authenticateJwt = async (token: string) => {
  if (!process.env.JWT_SECRET) {
    throw createError("JWT secret not configured", 500);
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
    userId: string;
    email: string;
  };

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw createError("User not found", 401);
  }

  return { user };
};

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw createError("Access token required", 401);
    }

    const token = authHeader.substring(7);

    if (isApiKeyToken(token)) {
      req.user = await authenticateApiKey(token);
      req.authMethod = "api_key";
    } else {
      const { user } = await authenticateJwt(token);
      req.user = user;
      req.authMethod = "jwt";
    }

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(createError("Invalid token", 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(createError("Token expired", 401));
    } else {
      next(error);
    }
  }
};

export const requireJwt = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.authMethod !== "jwt") {
    return next(createError("This action requires an interactive session", 403));
  }
  next();
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.substring(7);

    if (!process.env.JWT_SECRET) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      userId: string;
      email: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};
