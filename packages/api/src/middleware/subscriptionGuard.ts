import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth";

const ALLOWED_STATUSES = ["active", "trialing", "past_due"];

export const requireActiveSubscription = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Grandfathered users bypass subscription check
  if (user.isSubscriptionExempt) {
    return next();
  }

  // Allow stopping timers regardless of subscription status (prevent stuck timers)
  if (
    req.method === "POST" &&
    req.path.match(/^\/[^/]+\/stop$/)
  ) {
    return next();
  }

  if (
    user.subscriptionStatus &&
    ALLOWED_STATUSES.includes(user.subscriptionStatus)
  ) {
    return next();
  }

  return res.status(402).json({
    error: "subscription_required",
    message: "An active subscription is required.",
  });
};
