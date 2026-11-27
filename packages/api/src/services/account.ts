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
 *
 * A checkout running at the same moment can attach a new customer after
 * this one was read, so the row is only deleted while the customer on file
 * is the one just removed; otherwise that new customer goes too.
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

  let customerId = user.stripeCustomerId;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (customerId) await deleteStripeCustomer(customerId, user.id);
    const { count } = await prisma.user.deleteMany({ where: { id: user.id, stripeCustomerId: customerId } });
    if (count === 1) {
      logger.info("Account deleted", { userId: user.id });
      return;
    }
    const current = await prisma.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } });
    // Deleted by another request at the same time: done either way.
    if (!current) return;
    customerId = current.stripeCustomerId;
  }
  throw createError("Your account changed while it was being deleted, so it wasn't. Try again.", 409);
}

async function deleteStripeCustomer(customerId: string, userId: string): Promise<void> {
  try {
    await getStripe().customers.del(customerId);
  } catch (e) {
    const code = (e as { code?: string; statusCode?: number }).code;
    // Already gone in Stripe: nothing left to bill.
    if (code === "resource_missing") return;
    logger.error("Account deletion: could not delete the Stripe customer", {
      userId,
      error: (e as Error).message,
    });
    throw createError(
      "We couldn't cancel your subscription just now, so nothing was deleted. Try again in a few minutes.",
      502
    );
  }
}
