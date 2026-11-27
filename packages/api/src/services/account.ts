import bcrypt from "bcryptjs";
import { prisma } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { getStripe } from "../billing/stripeClient";
import { ServiceContext } from "./context";

/**
 * Deletes the account and everything in it (projects, entries, timers,
 * notes, API keys, share links, audit history: all cascade from the user).
 * Billing stops first: the Stripe customer is deleted, which cancels any
 * subscription at once, so a deleted account is never charged again. If
 * Stripe can't be reached the account is left as it was.
 */
export async function deleteAccount(ctx: ServiceContext, password: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, password: true, stripeCustomerId: true },
  });
  if (!user) throw createError("User not found", 404);
  if (!(await bcrypt.compare(password, user.password))) {
    throw createError("Password is incorrect", 400);
  }

  if (user.stripeCustomerId) {
    try {
      await getStripe().customers.del(user.stripeCustomerId);
    } catch (e) {
      const code = (e as { code?: string; statusCode?: number }).code;
      // Already gone in Stripe: nothing left to bill.
      if (code !== "resource_missing") {
        logger.error("Account deletion: could not delete the Stripe customer", {
          userId: user.id,
          error: (e as Error).message,
        });
        throw createError(
          "We couldn't cancel your subscription just now, so nothing was deleted. Try again in a few minutes.",
          502
        );
      }
    }
  }

  await prisma.user.delete({ where: { id: user.id } });
  logger.info("Account deleted", { userId: user.id });
}
