import Stripe from "stripe";
import { createError } from "../middleware/errorHandler";

let client: Stripe | null = null;

/** Lazily constructed Stripe client; 503 when billing isn't configured. */
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw createError("Billing is not configured on this server", 503);
  client = new Stripe(key);
  return client;
}

/** Tests inject a fake (network-free) client. */
export function setStripeClient(fake: Stripe | null): void {
  client = fake;
}
