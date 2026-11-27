import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { ZodError } from "zod";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  /** Machine-readable reason, e.g. "plan_limit" (sent as `code`). */
  code?: string;
}

/** Share link URLs carry their token; logs keep only its first characters. */
export const redactTokens = (url: string) =>
  // Case-insensitive, like Express's routing: /Public/Timesheets/<token> works too.
  url.replace(/(\/(?:share|public\/timesheets)\/)([^/?#]{6})[^/?#]*/gi, "$1$2…");

export const errorHandler = (
  err: AppError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = err.message;

  // Log error (share link tokens are secrets; keep them out of the logs)
  logger.error("Request failed", {
    error: err.message,
    stack: err.stack,
    url: redactTokens(req.url),
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    const validationErrors = err.errors.map((error) => {
      const field = error.path.join(".");
      return `${field}: ${error.message}`;
    });
    message = validationErrors.join(", ");
  }
  // Prisma errors
  else if (err.name === "PrismaClientKnownRequestError") {
    statusCode = 400;
    message = "Database operation failed";
  }
  // Validation errors
  else if (err.name === "ValidationError") {
    statusCode = 400;
  }
  // JWT errors
  else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }
  // App errors
  else if ("statusCode" in err && err.statusCode) {
    statusCode = err.statusCode;
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "Internal server error";
  }

  res.status(statusCode).json({
    error: message,
    // Only codes we set ourselves (createError) — never library codes like Prisma's.
    ...((err as AppError).isOperational && typeof (err as AppError).code === "string" && statusCode < 500
      ? { code: (err as AppError).code }
      : {}),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export const createError = (
  message: string,
  statusCode: number = 500,
  code?: string
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  if (code) error.code = code;
  return error;
};

export const asyncHandler =
  <T extends Request = Request, U extends Response = Response>(
    fn: (req: T, res: U, next: NextFunction) => Promise<any>
  ) =>
  (req: T, res: U, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
