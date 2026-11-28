import { sanitizeString } from "../middleware/sanitization";
import { createError } from "../middleware/errorHandler";

// An unpaired UTF-16 surrogate: Postgres can't store one.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Replaces unpaired surrogates with U+FFFD (same length). */
export const wellFormed = (value: string): string => value.replace(LONE_SURROGATE, "\uFFFD");

/** The first `max` UTF-16 units, never leaving half of a surrogate pair (e.g. an emoji) at the cut. */
export const cutText = (value: string, max: number): string => value.slice(0, max).replace(/[\uD800-\uDBFF]$/, "");

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
  const cleaned = sanitizeString(wellFormed(value));
  if (cleaned.length === 0) return null;
  if (cleaned.length > maxLength) {
    if (opts.truncate) return cutText(cleaned, maxLength);
    throw createError(`${field} must be at most ${maxLength} characters`, 400);
  }
  return cleaned;
}

/** Max length of entry/timer descriptions. */
export const DESCRIPTION_MAX = 2000;
