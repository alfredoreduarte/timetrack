import { prisma, TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";

/**
 * Plans. Billing is enforced only when Stripe is fully configured; until
 * then everyone has Pro (so deploying this code changes nothing).
 */
export type Plan = "free" | "pro";
export type PlanReason = "billing_disabled" | "grandfathered" | "subscription" | "trial" | "free";

export interface PlanLimits {
  /** Simultaneously running AI-agent timers (null = no plan limit). */
  maxRunningAgentTimers: number | null;
  /** How far back timesheets, share links and imports may reach (null = unlimited). */
  historyDays: number | null;
  shareLinks: boolean;
  aiCostLines: boolean;
}

export const FREE_LIMITS: PlanLimits = {
  maxRunningAgentTimers: 2,
  historyDays: 14,
  shareLinks: false,
  aiCostLines: false,
};
export const PRO_LIMITS: PlanLimits = {
  maxRunningAgentTimers: null,
  historyDays: null,
  shareLinks: true,
  aiCostLines: true,
};

export const TRIAL_DAYS = 14;

/** Subscription states that keep Pro (past_due: Stripe is retrying payment). */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface Entitlements {
  plan: Plan;
  reason: PlanReason;
  trialEndsAt: Date | null;
  limits: PlanLimits;
}

export const REQUIRED_STRIPE_ENV = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_YEARLY",
] as const;

export const billingEnabled = (): boolean => REQUIRED_STRIPE_ENV.every((k) => !!process.env[k]);

type PlanUser = {
  isSubscriptionExempt: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
};

export function entitlementsFor(user: PlanUser, now: Date = new Date()): Entitlements {
  const pro = (reason: PlanReason): Entitlements => ({
    plan: "pro",
    reason,
    trialEndsAt: user.trialEndsAt,
    limits: PRO_LIMITS,
  });
  if (!billingEnabled()) return pro("billing_disabled");
  if (user.isSubscriptionExempt) return pro("grandfathered");
  if (user.subscriptionStatus && ACTIVE_STATUSES.has(user.subscriptionStatus)) return pro("subscription");
  if (user.trialEndsAt && user.trialEndsAt > now) return pro("trial");
  return { plan: "free", reason: "free", trialEndsAt: user.trialEndsAt, limits: FREE_LIMITS };
}

export async function getEntitlements(
  userId: string,
  db: TxClient | typeof prisma = prisma,
  now: Date = new Date()
): Promise<Entitlements> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isSubscriptionExempt: true, subscriptionStatus: true, trialEndsAt: true },
  });
  return entitlementsFor(user, now);
}

const upgradeUrl = () => `${(process.env.APPLICATION_URL || "http://localhost:3010").replace(/\/$/, "")}/billing`;

/** 402 with a stable code clients (and agents) can branch on. */
export const planLimitError = (message: string) =>
  createError(`${message} Upgrade to Pro at ${upgradeUrl()}.`, 402, "plan_limit");

/** Earliest instant the plan lets a report or import reach back to. */
export function historyFloor(e: Entitlements, now: Date): Date | null {
  return e.limits.historyDays === null ? null : new Date(now.getTime() - e.limits.historyDays * 86400 * 1000);
}
