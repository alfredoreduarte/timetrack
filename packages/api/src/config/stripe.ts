import Stripe from "stripe";
import { logger } from "../utils/logger";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) {
  logger.error("STRIPE_SECRET_KEY is not set. Billing features will not work.");
}

if (!STRIPE_WEBHOOK_SECRET) {
  logger.error(
    "STRIPE_WEBHOOK_SECRET is not set. Webhook verification will fail."
  );
}

export const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-01-28.clover",
});

export const webhookSecret = STRIPE_WEBHOOK_SECRET || "";
