import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { getStripe } from "../billing/stripeClient";
import { ServiceContext } from "./context";
import { billingEnabled, entitlementsFor, TRIAL_DAYS } from "./entitlements";

export type BillingInterval = "month" | "year";

/** List prices shown in the app (the Stripe prices are the source of truth at checkout). */
export const DISPLAY_PRICES = {
  month: { amount: 15, currency: "usd" },
  year: { amount: 144, currency: "usd" },
} as const;

const appUrl = () => (process.env.APPLICATION_URL || "http://localhost:3010").replace(/\/$/, "");

const userBillingSelect = {
  id: true,
  email: true,
  isSubscriptionExempt: true,
  subscriptionStatus: true,
  subscriptionInterval: true,
  subscriptionCurrentPeriodEnd: true,
  subscriptionCancelAtPeriodEnd: true,
  stripeCustomerId: true,
  trialEndsAt: true,
} as const;

export async function getBillingStatus(ctx: ServiceContext) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: userBillingSelect });
  const e = entitlementsFor(user, ctx.now());
  const runningAgentTimers = await prisma.timeEntry.count({
    where: { userId: ctx.userId, isRunning: true, isAiGenerated: true },
  });
  return {
    billingEnabled: billingEnabled(),
    plan: e.plan,
    reason: e.reason,
    trialEndsAt: e.trialEndsAt,
    limits: e.limits,
    usage: { runningAgentTimers },
    subscription: user.subscriptionStatus
      ? {
          status: user.subscriptionStatus,
          interval: user.subscriptionInterval,
          currentPeriodEnd: user.subscriptionCurrentPeriodEnd,
          cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
        }
      : null,
    canManage: Boolean(user.stripeCustomerId),
    prices: DISPLAY_PRICES,
  };
}

const priceFor = (interval: BillingInterval) =>
  interval === "year" ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;

/** Hosted Stripe Checkout for Pro. Returns the URL to redirect to. */
export async function createCheckoutSession(ctx: ServiceContext, interval: BillingInterval) {
  if (!billingEnabled()) throw createError("Billing is not enabled on this server", 503);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: userBillingSelect });
  if (user.isSubscriptionExempt) throw createError("Your account already has Pro for free.", 400);
  if (user.subscriptionStatus && ["active", "trialing", "past_due"].includes(user.subscriptionStatus)) {
    throw createError("You already have a subscription. Manage it from the billing portal.", 400);
  }
  const stripe = getStripe();

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    // Conditional so two concurrent checkouts can't overwrite each other.
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, stripeCustomerId: null },
      data: { stripeCustomerId: customer.id },
    });
    customerId = claimed.count === 1
      ? customer.id
      : (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeCustomerId: true } }))
          .stripeCustomerId!;
  }

  // Subscribing during the app trial keeps the rest of the trial free:
  // Stripe starts billing when it ends (Stripe needs >= 48h of trial).
  const now = ctx.now().getTime();
  const trialEnd =
    user.trialEndsAt && user.trialEndsAt.getTime() - now > 2 * 86400 * 1000
      ? Math.floor(user.trialEndsAt.getTime() / 1000)
      : undefined;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceFor(interval)!, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId: user.id },
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    },
    success_url: `${appUrl()}/billing?checkout=success`,
    cancel_url: `${appUrl()}/billing?checkout=canceled`,
  });
  if (!session.url) throw createError("Stripe did not return a checkout URL", 502);
  return { url: session.url };
}

export async function createPortalSession(ctx: ServiceContext) {
  if (!billingEnabled()) throw createError("Billing is not enabled on this server", 503);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { stripeCustomerId: true } });
  if (!user.stripeCustomerId) throw createError("No billing account yet. Subscribe first.", 400);
  const portal = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl()}/billing`,
  });
  return { url: portal.url };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

const idOf = (ref: string | { id: string } | null | undefined): string | null =>
  !ref ? null : typeof ref === "string" ? ref : ref.id;

/**
 * Copies a subscription's current state onto its user. Always re-fetches
 * from Stripe so out-of-order or replayed events can't apply stale state.
 */
export async function syncSubscription(subscriptionId: string): Promise<boolean> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  const customerId = idOf(sub.customer as string | { id: string });
  const item = sub.items?.data?.[0];
  const user =
    (customerId && (await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } }))) ||
    (sub.metadata?.userId &&
      (await prisma.user.findUnique({ where: { id: sub.metadata.userId }, select: { id: true } })));
  if (!user) {
    logger.warn(`Stripe subscription ${sub.id} has no matching user (customer ${customerId})`);
    return false;
  }
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: ended ? null : sub.id,
      subscriptionStatus: sub.status,
      subscriptionPriceId: item?.price?.id ?? null,
      subscriptionInterval: item?.price?.recurring?.interval ?? null,
      subscriptionCurrentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
      subscriptionCancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    },
  });
  return true;
}

/** Links a completed Checkout to the user who started it. */
async function linkCheckout(session: Stripe.Checkout.Session) {
  const customerId = idOf(session.customer as string | { id: string } | null);
  const userId = session.client_reference_id;
  if (customerId && userId) {
    await prisma.user.updateMany({
      where: { id: userId, OR: [{ stripeCustomerId: null }, { stripeCustomerId: customerId }] },
      data: { stripeCustomerId: customerId },
    });
  }
  const subId = idOf(session.subscription as string | { id: string } | null);
  if (subId) await syncSubscription(subId);
}

const invoiceSubscriptionId = (invoice: Stripe.Invoice): string | null => {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
  const legacy = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  return idOf(parent?.subscription_details?.subscription ?? legacy ?? null);
};

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

/**
 * Verifies and processes one Stripe webhook. Throws on bad signatures
 * (400) and on processing failures (500, so Stripe retries). Processing is
 * idempotent; the StripeEvent row only short-circuits replays.
 */
export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookOutcome> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw createError("Billing is not configured on this server", 503);
  if (!signature) throw createError("Missing Stripe signature", 400);
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw createError("Invalid Stripe signature", 400);
  }

  if (await prisma.stripeEvent.findUnique({ where: { id: event.id } })) return "duplicate";

  let handled = true;
  switch (event.type) {
    case "checkout.session.completed":
      await linkCheckout(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncSubscription((event.data.object as Stripe.Subscription).id);
      break;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      if (subId) await syncSubscription(subId);
      break;
    }
    default:
      handled = false;
  }

  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (e) {
    // A concurrent delivery recorded it first; processing was idempotent.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  return handled ? "processed" : "ignored";
}

export { TRIAL_DAYS };
