import { Request, Response, NextFunction } from "express";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { logger } from "../utils/logger";

// Create a DOMPurify instance for server-side use
const window = new JSDOM("").window;
const purify = DOMPurify(window as any);

// Configure DOMPurify for our needs
const sanitizationConfig = {
  ALLOWED_TAGS: [], // No HTML tags allowed - convert everything to text
  ALLOWED_ATTR: [], // No attributes allowed
  KEEP_CONTENT: true, // Keep text content even when removing tags
  RETURN_DOM: false, // Return string, not DOM
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM_IMPORT: false,
  SANITIZE_DOM: true,
  WHOLE_DOCUMENT: false,
  SAFE_FOR_TEMPLATES: true,
};

/**
 * Sanitizes a string input to remove potential XSS vectors
 */
export const sanitizeString = (input: string): string => {
  if (typeof input !== "string") {
    return input;
  }

  // First pass: Remove HTML tags and attributes
  let sanitized = purify.sanitize(input, sanitizationConfig);

  // Additional cleaning for common XSS patterns
  sanitized = sanitized
    // Remove javascript: URLs
    .replace(/javascript:/gi, "")
    // Remove data: URLs that could contain scripts
    .replace(/data:(?!image\/[^;,]+;base64,)/gi, "")
    // Remove vbscript: URLs
    .replace(/vbscript:/gi, "")
    // Remove on* event handlers (just in case)
    .replace(/\s*on\w+\s*=/gi, "")
    // Remove any remaining < or > that might have been encoded
    .replace(/[<>]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Log if significant sanitization occurred
  if (input !== sanitized && input.length > 0) {
    logger.warn({
      type: "input_sanitized",
      original_length: input.length,
      sanitized_length: sanitized.length,
      removed_content: input.length - sanitized.length > 10, // Only log if significant content was removed
      timestamp: new Date().toISOString(),
    });
  }

  return sanitized;
};

/**
 * Recursively sanitizes all string values in an object
 */
const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === "object") {
    const sanitizedObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitizedObj[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitizedObj;
  }

  return obj;
};

/**
 * Middleware to sanitize request body inputs
 * Should be applied after body parsing middleware
 */
export const sanitizeInputs = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Only sanitize specific fields that are likely to be displayed in UI
    const fieldsToSanitize = [
      "name",
      "description",
      "title",
      "comment",
      "notes",
      "tags",
      "label",
      "displayName",
    ];

    if (req.body && typeof req.body === "object") {
      // Create a new body object to avoid mutating the original
      const sanitizedBody = { ...req.body };

      // Sanitize specified fields if they exist
      for (const field of fieldsToSanitize) {
        if (sanitizedBody[field] !== undefined) {
          const originalValue = sanitizedBody[field];
          sanitizedBody[field] = sanitizeObject(originalValue);

          // Log field-specific sanitization
          if (
            typeof originalValue === "string" &&
            originalValue !== sanitizedBody[field]
          ) {
            logger.info({
              type: "field_sanitized",
              field,
              path: req.path,
              ip: req.ip,
              userAgent: req.get("User-Agent"),
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // Replace the request body with sanitized version
      req.body = sanitizedBody;
    }

    // Also sanitize query parameters that might be displayed
    if (req.query && typeof req.query === "object") {
      const sanitizedQuery = { ...req.query };

      for (const field of fieldsToSanitize) {
        if (
          sanitizedQuery[field] !== undefined &&
          typeof sanitizedQuery[field] === "string"
        ) {
          sanitizedQuery[field] = sanitizeString(
            sanitizedQuery[field] as string
          );
        }
      }

      req.query = sanitizedQuery;
    }

    next();
  } catch (error) {
    logger.error({
      type: "sanitization_error",
      error: error instanceof Error ? error.message : "Unknown error",
      path: req.path,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Don't block the request on sanitization errors, but log them
    next();
  }
};

/**
 * Aggressive sanitization middleware for high-risk endpoints
 * Sanitizes all string fields, not just specific ones
 */
export const aggressiveSanitization = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body);
    }

    if (req.query && typeof req.query === "object") {
      req.query = sanitizeObject(req.query);
    }

    next();
  } catch (error) {
    logger.error({
      type: "aggressive_sanitization_error",
      error: error instanceof Error ? error.message : "Unknown error",
      path: req.path,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    next();
  }
};
