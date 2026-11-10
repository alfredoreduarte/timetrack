/**
 * One-time Stripe setup for TimeTrack Pro. Idempotent: re-running reuses
 * the product and prices (found by lookup key) and only creates a webhook
 * endpoint if none points at this API yet.
 *
 *   STRIPE_SECRET_KEY=sk_live_... API_PUBLIC_URL=https://api.track.alfredo.re \
 *     npx ts-node scripts/stripe-setup.ts
 *
 * Prints the env lines to add to docker.env on the server.
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
const apiUrl = (process.env.API_PUBLIC_URL || "").replace(/\/$/, "");
if (!key) throw new Error("Set STRIPE_SECRET_KEY");
if (!apiUrl.startsWith("https://")) throw new Error("Set API_PUBLIC_URL to the API's public https URL");

const stripe = new Stripe(key);
const PRODUCT_NAME = "TimeTrack Pro";
const PRICES = [
  { lookupKey: "timetrack_pro_monthly", interval: "month" as const, unitAmount: 1500, env: "STRIPE_PRICE_MONTHLY" },
  { lookupKey: "timetrack_pro_yearly", interval: "year" as const, unitAmount: 14400, env: "STRIPE_PRICE_YEARLY" },
];
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
];

async function main() {
  const existing = await stripe.prices.list({ lookup_keys: PRICES.map((p) => p.lookupKey), expand: ["data.product"] });
  let productId = (existing.data[0]?.product as Stripe.Product | undefined)?.id;
  if (!productId) {
    const product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: "Billable hours for developers who ship with AI agents: unlimited parallel agent timers, full history, client timesheets and share links.",
    });
    productId = product.id;
  }

  const lines: string[] = [];
  for (const p of PRICES) {
    let price = existing.data.find((x) => x.lookup_key === p.lookupKey);
    if (!price) {
      price = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: p.unitAmount,
        recurring: { interval: p.interval },
        lookup_key: p.lookupKey,
      });
    }
    lines.push(`${p.env}=${price.id}`);
  }

  const url = `${apiUrl}/billing/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = endpoints.data.find((e) => e.url === url);
  if (found) {
    console.log(`Webhook endpoint already exists (${found.id}); keep the STRIPE_WEBHOOK_SECRET you saved when it was created, or roll it in the Stripe dashboard.`);
  } else {
    const endpoint = await stripe.webhookEndpoints.create({ url, enabled_events: EVENTS });
    lines.push(`STRIPE_WEBHOOK_SECRET=${endpoint.secret}`);
  }

  console.log("\nAdd to docker.env on the server, then restart the API:\n");
  console.log(["STRIPE_SECRET_KEY=<the key you used>", ...lines].join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
