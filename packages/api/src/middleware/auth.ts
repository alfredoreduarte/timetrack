import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/database";
import { createError } from "./errorHandler";
import { hashApiKey, isApiKeyToken } from "../utils/apiKeys";

export type AuthMethod = "jwt" | "api_key";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
  authMethod?: AuthMethod;
  apiKeyId?: string;
}

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

  // Bump lastUsedAt asynchronously; we don't need to wait.
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { user: apiKey.user, apiKeyId: apiKey.id };
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
      const { user, apiKeyId } = await authenticateApiKey(token);
      req.user = user;
      req.authMethod = "api_key";
      req.apiKeyId = apiKeyId;
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

    if (isApiKeyToken(token)) {
      const { user, apiKeyId } = await authenticateApiKey(token);
      req.user = user;
      req.authMethod = "api_key";
      req.apiKeyId = apiKeyId;
    } else if (process.env.JWT_SECRET) {
      const { user } = await authenticateJwt(token);
      req.user = user;
      req.authMethod = "jwt";
    }

    next();
  } catch (error) {
    // Optional auth swallows errors so unauthenticated traffic still flows.
    next();
  }
};
