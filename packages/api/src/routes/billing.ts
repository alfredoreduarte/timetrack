import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { authenticate, requireJwt, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import {
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
  handleStripeWebhook,
} from "../services/subscriptions";
import { logger } from "../utils/logger";

const router = express.Router();
router.use(authenticate);

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? "anon",
  message: { error: "Too many checkout attempts, try again later." },
});

const checkoutSchema = z.object({ interval: z.enum(["month", "year"]).default("month") }).strict();

/**
 * @swagger
 * /billing/status:
 *   get:
 *     summary: Plan, limits, trial and subscription state for the caller
 *     tags: [Billing]
 * /billing/checkout:
 *   post:
 *     summary: Start a Stripe Checkout for Pro (interactive sessions only)
 *     tags: [Billing]
 * /billing/portal:
 *   post:
 *     summary: Open the Stripe customer portal (interactive sessions only)
 *     tags: [Billing]
 */
router.get(
  "/status",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json(await getBillingStatus(contextFromRequest(req)));
  })
);

// Payment flows need a human at the keyboard: API keys (agents) can't buy.
router.post(
  "/checkout",
  requireJwt,
  checkoutLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { interval } = checkoutSchema.parse(req.body ?? {});
    res.json(await createCheckoutSession(contextFromRequest(req), interval));
  })
);

router.post(
  "/portal",
  requireJwt,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json(await createPortalSession(contextFromRequest(req)));
  })
);

/**
 * Stripe webhook. Mounted in app.ts BEFORE the JSON body parser: signature
 * verification needs the raw bytes.
 */
export const stripeWebhook: express.RequestHandler = async (req, res) => {
  try {
    const outcome = await handleStripeWebhook(req.body as Buffer, req.headers["stripe-signature"] as string | undefined);
    res.json({ received: true, outcome });
  } catch (e) {
    // Only this app's own checks (signature, configuration) answer 4xx/503;
    // anything else — including errors Stripe's API returned while syncing —
    // is a 500 so Stripe retries, and is always logged.
    const err = e as { statusCode?: number; isOperational?: boolean; message?: string; type?: string };
    const status = err.isOperational && err.statusCode ? err.statusCode : 500;
    logger[status >= 500 ? "error" : "warn"]("Stripe webhook not processed", {
      status,
      error: err.message,
      stripeErrorType: err.type,
    });
    res.status(status).json({ error: status >= 500 ? "Webhook processing failed" : err.message });
  }
};

export default router;
