import { sanitizeString } from "../middleware/sanitization";
import { createError } from "../middleware/errorHandler";

/**
 * Sanitizes free text coming from agents or users. The HTTP sanitizer only
 * covers top-level body fields, so services sanitize again (idempotent).
 * Returns undefined for undefined (field not provided) and null for empty.
 */
export function cleanText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
  opts: { truncate?: boolean } = {}
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = sanitizeString(value);
  if (cleaned.length === 0) return null;
  if (cleaned.length > maxLength) {
    if (opts.truncate) return cleaned.slice(0, maxLength);
    throw createError(`${field} must be at most ${maxLength} characters`, 400);
  }
  return cleaned;
}

/** Max length of entry/timer descriptions. */
export const DESCRIPTION_MAX = 2000;
