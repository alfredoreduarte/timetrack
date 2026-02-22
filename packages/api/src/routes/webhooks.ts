import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe, webhookSecret } from "../config/stripe";
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";

/**
 * Extract the current_period_end from a subscription's first item.
 * In Stripe API 2026+, period dates live on subscription items, not the subscription itself.
 */
function getPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items?.data?.[0];
  if (item?.current_period_end) {
    return new Date(item.current_period_end * 1000);
  }
  return null;
}

function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

export const stripeWebhookHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    logger.warn("Webhook request missing stripe-signature header");
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    logger.error(`Webhook signature verification failed: ${err.message}`);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.customer) break;

        const customerId = getCustomerId(session.customer);
        if (!customerId) break;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!subscriptionId) break;

        // Fetch full subscription to get status and period end
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);

        const periodEnd = getPeriodEnd(subscription);

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionCurrentPeriodEnd: periodEnd,
            subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        });

        logger.info(
          `Checkout completed for customer ${customerId}, subscription ${subscription.id}`
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = getCustomerId(subscription.customer);
        if (!customerId) break;

        const periodEnd = getPeriodEnd(subscription);

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionStatus: subscription.status,
            subscriptionCurrentPeriodEnd: periodEnd,
            subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        });

        logger.info(
          `Subscription updated for customer ${customerId}: status=${subscription.status}`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = getCustomerId(subscription.customer);
        if (!customerId) break;

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null,
            subscriptionCancelAtPeriodEnd: false,
          },
        });

        logger.info(`Subscription deleted for customer ${customerId}`);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = getCustomerId(invoice.customer);
        if (!customerId) break;

        // Get subscription ID from the invoice's parent details
        const subscriptionRef =
          invoice.parent?.subscription_details?.subscription;
        if (!subscriptionRef) break;

        const subscriptionId =
          typeof subscriptionRef === "string"
            ? subscriptionRef
            : subscriptionRef.id;

        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);

        const periodEnd = getPeriodEnd(subscription);

        if (periodEnd) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionCurrentPeriodEnd: periodEnd },
          });
        }

        logger.info(
          `Invoice paid for customer ${customerId}, period updated`
        );
        break;
      }

      default:
        logger.info(`Unhandled webhook event type: ${event.type}`);
    }
  } catch (err: any) {
    logger.error(
      `Error processing webhook event ${event.type}: ${err.message}`
    );
    // Return 200 to prevent Stripe retries for processing errors
    // The event can be replayed manually if needed
  }

  res.json({ received: true });
};
