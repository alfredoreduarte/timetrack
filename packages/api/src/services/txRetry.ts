import { Prisma } from "@prisma/client";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

const DEADLOCK_CODES = new Set(["40P01", "40001"]);
// Deadlocks raised inside ORM calls of an interactive transaction come back
// as PrismaClientUnknownRequestError with the SQLSTATE only in the message.
const DEADLOCK_RE = /\b(40P01|40001)\b|deadlock detected/;

/** A deadlock or serialization failure: the whole transaction may be retried. */
export function isRetryableTxError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2034") return true;
    const dbCode = (e.meta as { code?: string } | undefined)?.code;
    return (
      e.code === "P2010" &&
      typeof dbCode === "string" &&
      DEADLOCK_CODES.has(dbCode)
    );
  }
  return (
    e instanceof Prisma.PrismaClientUnknownRequestError &&
    DEADLOCK_RE.test(e.message)
  );
}

/**
 * Runs a transaction body, retrying it when Postgres aborts it as a deadlock
 * victim (or `retryIf` matches); 409 once the attempts run out.
 */
export async function withTxRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { attempts?: number; retryIf?: (e: unknown) => boolean } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryableTxError(e) && !opts.retryIf?.(e)) throw e;
      if (attempt >= attempts) {
        logger.warn("Transaction kept colliding with concurrent writes", {
          label,
          attempts: attempt,
        });
        throw createError(
          "This is being changed right now. Try again in a moment.",
          409,
        );
      }
    }
  }
}
