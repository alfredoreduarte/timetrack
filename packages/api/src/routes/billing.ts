import express, { Response } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { stripe } from "../config/stripe";
import { logger } from "../utils/logger";

const router = express.Router();

// Rate limiter for checkout session creation (5 per hour per user)
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Too many checkout attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip,
});

// All billing routes require authentication
router.use(authenticate);

/**
 * POST /billing/create-checkout-session
 * Creates a Stripe Checkout Session and returns the redirect URL.
 */
router.post(
  "/create-checkout-session",
  checkoutLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        stripeCustomerId: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      throw createError("User not found", 404);
    }

    // Prevent creating checkout if already actively subscribed
    if (
      user.subscriptionStatus &&
      ["active", "trialing"].includes(user.subscriptionStatus)
    ) {
      throw createError("You already have an active subscription", 400);
    }

    const priceId = process.env.STRIPE_PRICE_ID_MONTHLY;
    if (!priceId) {
      throw createError("Stripe price not configured", 500);
    }

    const appUrl =
      process.env.APPLICATION_URL || "http://localhost:3010";

    // Look up or create Stripe Customer
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customer.id },
      });

      stripeCustomerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${appUrl}/billing?success=true`,
      cancel_url: `${appUrl}/billing?canceled=true`,
    });

    res.json({ url: session.url });
  })
);

/**
 * POST /billing/create-portal-session
 * Creates a Stripe Customer Portal session for subscription management.
 */
router.post(
  "/create-portal-session",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw createError(
        "No billing account found. Please subscribe first.",
        400
      );
    }

    const appUrl =
      process.env.APPLICATION_URL || "http://localhost:3010";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    res.json({ url: portalSession.url });
  })
);

export default router;
