jest.mock("svg-captcha", () => ({ create: () => ({ text: "abcd", data: "<svg/>" }) }));

import Stripe from "stripe";
import { prisma } from "../../utils/database";
import { setStripeClient } from "../../billing/stripeClient";
import { entitlementsFor } from "../../services/entitlements";
import { api, resetDb, createUser, createApiKey, createProject, disconnect } from "../../test/helpers";

const STRIPE_ENV = {
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
  STRIPE_PRICE_MONTHLY: "price_month",
  STRIPE_PRICE_YEARLY: "price_year",
};
const enableBilling = () => Object.assign(process.env, STRIPE_ENV);
const disableBilling = () => {
  for (const k of Object.keys(STRIPE_ENV)) delete process.env[k];
};

const realStripe = new Stripe("sk_test_fake");
const fake = {
  webhooks: realStripe.webhooks,
  customers: { create: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  subscriptions: { retrieve: jest.fn(), list: jest.fn() },
};

beforeEach(async () => {
  await resetDb();
  disableBilling();
  // Every test sets up the Stripe calls it relies on; none inherits another's.
  jest.resetAllMocks();
  fake.subscriptions.list.mockResolvedValue({ data: [] });
  fake.customers.create.mockResolvedValue({ id: "cus_default" });
  setStripeClient(fake as unknown as Stripe);
});
afterAll(async () => {
  disableBilling();
  setStripeClient(null);
  await disconnect();
});

// A user whose trial has ended (trialEndsAt null now means "trial not started yet").
const freeUser = () => createUser({ isSubscriptionExempt: false, trialEndsAt: new Date(Date.now() - 86400_000) });

describe("entitlements", () => {
  const base = { isSubscriptionExempt: false, subscriptionStatus: null, trialEndsAt: null };
  it("gives everyone Pro while billing is not configured", () => {
    expect(entitlementsFor(base)).toMatchObject({ plan: "pro", reason: "billing_disabled" });
  });
  it("resolves grandfathered, subscribed, trial and free users", () => {
    enableBilling();
    const now = new Date("2026-03-01T00:00:00Z");
    expect(entitlementsFor({ ...base, isSubscriptionExempt: true }, now).reason).toBe("grandfathered");
    expect(entitlementsFor({ ...base, subscriptionStatus: "active" }, now).reason).toBe("subscription");
    expect(entitlementsFor({ ...base, subscriptionStatus: "past_due" }, now).plan).toBe("pro");
    expect(entitlementsFor({ ...base, subscriptionStatus: "canceled" }, now).plan).toBe("free");
    expect(entitlementsFor({ ...base, trialEndsAt: new Date("2026-03-05T00:00:00Z") }, now).reason).toBe("trial");
    expect(entitlementsFor({ ...base, trialEndsAt: new Date("2026-02-20T00:00:00Z") }, now)).toMatchObject({
      plan: "free",
      limits: { maxRunningAgentTimers: 2, historyDays: 14, shareLinks: false },
    });
  });
});

describe("plan limits (billing enabled)", () => {
  beforeEach(enableBilling);

  it("caps parallel AI-agent timers on Free, never human timers", async () => {
    const { user, auth } = await freeUser();
    const key = await createApiKey(user.id);
    expect((await api().post("/timers").set(key.auth).send({})).status).toBe(201);
    expect((await api().post("/timers").set(key.auth).send({})).status).toBe(201);
    const third = await api().post("/timers").set(key.auth).send({});
    expect(third.status).toBe(402);
    expect(third.body).toMatchObject({ code: "plan_limit" });
    expect(third.body.error).toMatch(/Upgrade to Pro at .*\/billing/);
    // Human timers are not limited by plan.
    expect((await api().post("/time-entries/start").set(auth).send({})).status).toBe(201);
    // Hooks never fail: the agent is told it isn't tracked.
    const hook = await api()
      .post("/agent-events?format=claude-code")
      .set(key.auth)
      .send({ hook_event_name: "SessionStart", session_id: "s3", cwd: "/x" });
    expect(hook.status).toBe(200);
    expect(hook.body.hookSpecificOutput.additionalContext).toMatch(/NOT tracking.*Free plan/);
  });

  it("lets grandfathered, trial and subscribed users run many agents", async () => {
    for (const overrides of [
      { isSubscriptionExempt: true },
      { isSubscriptionExempt: false, trialEndsAt: new Date(Date.now() + 86400_000) },
      { isSubscriptionExempt: false, subscriptionStatus: "active" },
    ]) {
      const { user } = await createUser(overrides);
      const key = await createApiKey(user.id);
      for (let i = 0; i < 4; i++) expect((await api().post("/timers").set(key.auth).send({})).status).toBe(201);
    }
  });

  it("limits Free timesheets to 14 days and omits AI cost lines", async () => {
    const { user, auth } = await freeUser();
    const p = await createProject(user.id, { includeAiCosts: true });
    const old = new Date(Date.now() - 30 * 86400_000).toISOString();
    const res = await api().get(`/reports/timesheet?startDate=${old}&projectId=${p.id}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.timesheet.limitedByPlan).toMatchObject({ historyDays: 14 });
    expect(new Date(res.body.timesheet.range.startDate).getTime()).toBeGreaterThan(Date.now() - 15 * 86400_000);
    expect(res.body.timesheet.projects[0].policy.includeAiCosts).toBe(false);
    const ancient = await api()
      .get(`/reports/timesheet?startDate=${old}&endDate=${new Date(Date.now() - 20 * 86400_000).toISOString()}`)
      .set(auth);
    expect(ancient.status).toBe(402);
  });

  it("makes share links Pro-only and clips imports to 14 days", async () => {
    const { auth } = await freeUser();
    const link = await api().post("/share-links").set(auth).send({ rollingDays: 7 });
    expect(link.status).toBe(402);
    const day = 86400_000;
    const at = (d: number) => new Date(Date.now() - d * day).toISOString();
    const imp = await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [{ sessionKey: "old", spans: [[at(20), at(19.9)]] }, { sessionKey: "new", spans: [[at(2), at(1.99)]] }] });
    expect(imp.body.limitedByPlan).toMatchObject({ historyDays: 14 });
    expect(imp.body.sessions.map((s: { status: string }) => s.status)).toEqual(["empty", "imported"]);
  });

  it("pauses a trial's share links when the trial ends and restores them on upgrade", async () => {
    const { user, auth } = await createUser({ isSubscriptionExempt: false, trialEndsAt: new Date(Date.now() + 86400_000) });
    await createProject(user.id, { name: "Acme" });
    const made = await api().post("/share-links").set(auth).send({ rollingDays: 7 });
    expect(made.status).toBe(201);
    const token = made.body.url.split("/share/")[1];
    expect((await api().get(`/public/timesheets/${token}`)).status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    expect((await api().get(`/public/timesheets/${token}`)).status).toBe(404);

    await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: "active" } });
    const back = await api().get(`/public/timesheets/${token}`);
    expect(back.status).toBe(200);
    expect(back.body.timesheet.limitedByPlan).toBeNull();
  });

  it("reports billing status", async () => {
    const { user, auth } = await freeUser();
    const key = await createApiKey(user.id);
    await api().post("/timers").set(key.auth).send({});
    const res = await api().get("/billing/status").set(auth);
    expect(res.body).toMatchObject({
      billingEnabled: true,
      plan: "free",
      usage: { runningAgentTimers: 1 },
      prices: { month: { amount: 15 }, year: { amount: 144 } },
      canManage: false,
    });
  });
});

describe("signup trial", () => {
  it("starts every new account on a 14-day Pro trial", async () => {
    enableBilling();
    const captcha = await api().get("/auth/captcha");
    const captchaId = captcha.body.captchaId ?? captcha.body.id;
    const res = await api()
      .post("/auth/register")
      .send({ name: "New Dev", email: "new@dev.test", password: "hunter22!", captchaId, captchaValue: "abcd" });
    expect(res.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "new@dev.test" } });
    expect(u.isSubscriptionExempt).toBe(false);
    const days = (u.trialEndsAt!.getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    const status = await api().get("/billing/status").set("Authorization", `Bearer ${res.body.token}`);
    expect(status.body).toMatchObject({ plan: "pro", reason: "trial" });
  });
});

describe("checkout, portal and webhooks", () => {
  beforeEach(enableBilling);

  it("creates a checkout for humans only, keeping the remaining trial", async () => {
    const { user, auth } = await createUser({ isSubscriptionExempt: false, trialEndsAt: new Date(Date.now() + 10 * 86400_000) });
    fake.customers.create.mockResolvedValue({ id: "cus_1" });
    fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s/1" });
    const res = await api().post("/billing/checkout").set(auth).send({ interval: "year" });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.test/s/1");
    const args = fake.checkout.sessions.create.mock.calls[0][0];
    expect(args).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      client_reference_id: user.id,
      line_items: [{ price: "price_year", quantity: 1 }],
    });
    expect(args.subscription_data.trial_end).toBeGreaterThan(Date.now() / 1000 + 9 * 86400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).stripeCustomerId).toBe("cus_1");

    const key = await createApiKey(user.id);
    expect((await api().post("/billing/checkout").set(key.auth).send({})).status).toBe(403);
    const exempt = await createUser({ isSubscriptionExempt: true });
    expect((await api().post("/billing/checkout").set(exempt.auth).send({})).status).toBe(400);
  });

  const signedPost = (event: Record<string, unknown>, secret = STRIPE_ENV.STRIPE_WEBHOOK_SECRET) => {
    const payload = JSON.stringify(event);
    const header = realStripe.webhooks.generateTestHeaderString({ payload, secret });
    return api()
      .post("/billing/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", header)
      .send(payload);
  };

  const subscription = (status: string, cancelAtPeriodEnd = false) => ({
    id: "sub_1",
    object: "subscription",
    status,
    customer: "cus_9",
    cancel_at_period_end: cancelAtPeriodEnd,
    metadata: {},
    items: { data: [{ current_period_end: 1893456000, price: { id: "price_month", recurring: { interval: "month" } } }] },
  });

  it("activates Pro from a signed checkout webhook, ignores replays, and follows later changes", async () => {
    const { user, auth } = await freeUser();
    fake.subscriptions.retrieve.mockResolvedValue(subscription("active"));
    const checkoutEvent = {
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", object: "checkout.session", mode: "subscription", customer: "cus_9", client_reference_id: user.id, subscription: "sub_1" } },
    };
    const res = await signedPost(checkoutEvent);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("processed");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after).toMatchObject({
      stripeCustomerId: "cus_9",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
      subscriptionInterval: "month",
      subscriptionCurrentPeriodEnd: new Date(1893456000 * 1000),
    });
    expect((await api().get("/billing/status").set(auth)).body).toMatchObject({ plan: "pro", reason: "subscription" });

    expect((await signedPost(checkoutEvent)).body.outcome).toBe("duplicate");

    // Out-of-order safety: the handler re-fetches the subscription, so a
    // stale "updated" payload can't override the live state.
    fake.subscriptions.retrieve.mockResolvedValue(subscription("canceled"));
    await signedPost({
      id: "evt_2",
      object: "event",
      type: "customer.subscription.deleted",
      data: { object: { ...subscription("active"), id: "sub_1" } },
    });
    const canceled = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(canceled).toMatchObject({ subscriptionStatus: "canceled", stripeSubscriptionId: null });
    expect((await api().get("/billing/status").set(auth)).body.plan).toBe("free");
  });

  it("rejects unsigned or forged webhooks", async () => {
    const payload = JSON.stringify({ id: "evt_x", type: "customer.subscription.updated", data: { object: {} } });
    expect((await api().post("/billing/webhook").set("Content-Type", "application/json").send(payload)).status).toBe(400);
    expect((await signedPost({ id: "evt_y", type: "x", data: { object: {} } }, "whsec_wrong")).status).toBe(400);
  });

  it("opens the portal only for customers", async () => {
    const { auth } = await createUser({ isSubscriptionExempt: false });
    expect((await api().post("/billing/portal").set(auth).send({})).status).toBe(400);
    const c = await createUser({ isSubscriptionExempt: false, stripeCustomerId: "cus_p" });
    fake.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.test/p" });
    const res = await api().post("/billing/portal").set(c.auth).send({});
    expect(res.body.url).toBe("https://billing.stripe.test/p");
  });

  it("refuses checkout when billing isn't configured", async () => {
    disableBilling();
    const { auth } = await createUser();
    expect((await api().post("/billing/checkout").set(auth).send({})).status).toBe(503);
  });
});

describe("S4 review fixes", () => {
  const signedPost = (event: Record<string, unknown>) => {
    const payload = JSON.stringify(event);
    const header = realStripe.webhooks.generateTestHeaderString({ payload, secret: STRIPE_ENV.STRIPE_WEBHOOK_SECRET });
    return api().post("/billing/webhook").set("Content-Type", "application/json").set("Stripe-Signature", header).send(payload);
  };
  const sub = (id: string, status: string, created: number) => ({
    id,
    object: "subscription",
    status,
    created,
    customer: "cus_9",
    cancel_at_period_end: false,
    metadata: {},
    items: { data: [{ current_period_end: 1893456000, price: { id: "price_year", recurring: { interval: "year" } } }] },
  });
  const day = 86400_000;
  const at = (d: number) => new Date(Date.now() - d * day).toISOString();

  it("a late event about an old subscription never drops a paying customer to Free", async () => {
    enableBilling();
    const { user, auth } = await freeUser();
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: "cus_9" } });
    const oldSub = sub("sub_old", "canceled", 1_700_000_000);
    const newSub = sub("sub_new", "active", 1_800_000_000);
    fake.subscriptions.list.mockResolvedValue({ data: [newSub, oldSub] });

    fake.subscriptions.retrieve.mockResolvedValue(newSub);
    await signedPost({ id: "evt_a", object: "event", type: "customer.subscription.created", data: { object: { id: "sub_new" } } });
    fake.subscriptions.retrieve.mockResolvedValue(oldSub);
    const late = await signedPost({ id: "evt_b", object: "event", type: "customer.subscription.deleted", data: { object: { id: "sub_old" } } });
    expect(late.status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u).toMatchObject({ stripeSubscriptionId: "sub_new", subscriptionStatus: "active" });
    expect((await api().get("/billing/status").set(auth)).body).toMatchObject({ plan: "pro", reason: "subscription" });
  });

  it("refuses a second checkout when Stripe already has a live subscription, and dedupes double clicks", async () => {
    enableBilling();
    const { user, auth } = await freeUser();
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: "cus_9" } });
    fake.subscriptions.list.mockResolvedValue({ data: [sub("sub_x", "active", 1_800_000_000)] });
    expect((await api().post("/billing/checkout").set(auth).send({ interval: "month" })).status).toBe(400);

    fake.subscriptions.list.mockResolvedValue({ data: [] });
    fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s/2" });
    await api().post("/billing/checkout").set(auth).send({ interval: "month" });
    await api().post("/billing/checkout").set(auth).send({ interval: "month" });
    const keys = fake.checkout.sessions.create.mock.calls.map((c: unknown[]) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toMatch(/^checkout:/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("Stripe API errors during a webhook are a logged 500, not an echoed 4xx", async () => {
    enableBilling();
    const err = Object.assign(new Error("No such subscription"), { statusCode: 404, type: "StripeInvalidRequestError" });
    fake.subscriptions.retrieve.mockRejectedValue(err);
    const res = await signedPost({ id: "evt_c", object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_zz" } } });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Webhook processing failed");
  });

  it("re-importing on Free never deletes entries older than the plan window", async () => {
    enableBilling();
    const { user, auth } = await createUser({ isSubscriptionExempt: false, trialEndsAt: new Date(Date.now() + day) });
    const session = { sessionKey: "long", spans: [[at(20), at(19.9)], [at(2), at(1.9)]] };
    const first = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session] });
    expect(first.body.sessions[0]).toMatchObject({ status: "imported", segments: 2 });

    await prisma.user.update({ where: { id: user.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const again = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session] });
    expect(again.body.sessions[0].status).toBe("skipped_plan");
    expect(await prisma.timeEntry.count({ where: { userId: user.id } })).toBe(2);
  });

  it("a Free re-import adds new recent work when nothing older is stored", async () => {
    enableBilling();
    const { user, auth } = await freeUser();
    // Transcripts replay identical timestamps; build them once.
    const old = [at(15), at(14.9)];
    const mid = [at(3), at(2.9)];
    const recent = [at(0.1), at(0.05)];
    const first = await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [{ sessionKey: "resumed", spans: [old, mid] }] });
    expect(first.body.sessions[0]).toMatchObject({ status: "imported", segments: 1 });
    const again = await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [{ sessionKey: "resumed", spans: [old, mid, recent] }] });
    expect(again.body.sessions[0].status).toBe("replaced");
    expect(await prisma.timeEntry.count({ where: { userId: user.id } })).toBe(2);
  });

  it("a Free re-import re-checks the plan window under the row lock (a full import may land in between)", async () => {
    enableBilling();
    const { user, auth } = await freeUser();
    const old = [at(15), at(14.9)];
    const mid = [at(3), at(2.9)];
    const recent = [at(0.1), at(0.05)];
    await api().post("/agent-sessions/import").set(auth).send({ sessions: [{ sessionKey: "k", spans: [old, mid] }] });

    // Between the Free request's first look and its row lock (the import's
    // write transaction), the same user, now on Pro, re-imports it in full.
    const original = prisma.$transaction.bind(prisma) as (...a: unknown[]) => Promise<unknown>;
    let concurrent: { body: { sessions: Array<{ status: string }> } } | null = null;
    let armed = true;
    jest.spyOn(prisma, "$transaction").mockImplementation((async (...a: unknown[]) => {
      if (armed && typeof a[0] === "function") {
        armed = false;
        await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: "active" } });
        concurrent = await api().post("/agent-sessions/import").set(auth).send({ sessions: [{ sessionKey: "k", spans: [old, mid, recent] }] });
        await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: null } });
      }
      return original(...a);
    }) as never);

    let free;
    try {
      free = await api().post("/agent-sessions/import").set(auth).send({ sessions: [{ sessionKey: "k", spans: [old, mid, recent] }] });
    } finally {
      jest.restoreAllMocks();
    }
    expect(concurrent!.body.sessions[0].status).toBe("replaced");
    expect(free.body.sessions[0].status).toBe("skipped_plan");
    const stored = await prisma.timeEntry.findMany({ where: { userId: user.id }, select: { startTime: true } });
    expect(stored.some((e) => e.startTime.toISOString() === old[0])).toBe(true);
  });

  it("on Free, an edited session is reported as edited, not as a plan limit", async () => {
    enableBilling();
    const { user, auth } = await freeUser();
    const old = [at(20), at(19.9)];
    const recent = [at(2), at(1.9)];
    await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: "active" } });
    await api().post("/agent-sessions/import").set(auth).send({ sessions: [{ sessionKey: "e", spans: [old, recent] }] });
    const entry = await prisma.timeEntry.findFirstOrThrow({ where: { userId: user.id } });
    expect((await api().put(`/time-entries/${entry.id}`).set(auth).send({ description: "Reviewed with client" })).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: null } });
    const res = await api().post("/agent-sessions/import").set(auth).send({ sessions: [{ sessionKey: "e", spans: [old, recent] }] });
    expect(res.body.sessions[0].status).toBe("skipped_edited");
  });

  it("checkout starts a pending trial first, so going straight to checkout keeps the 14 days", async () => {
    enableBilling();
    const { auth } = await createUser({ isSubscriptionExempt: false, trialEndsAt: null });
    fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s/3" });
    expect((await api().post("/billing/checkout").set(auth).send({ interval: "month" })).status).toBe(200);
    const [params, options] = fake.checkout.sessions.create.mock.calls[0] as [
      { subscription_data: { trial_end?: number } },
      { idempotencyKey: string },
    ];
    const days = (params.subscription_data.trial_end! * 1000 - Date.now()) / day;
    expect(days).toBeGreaterThan(13.9);
    expect(options.idempotencyKey).toContain(String(params.subscription_data.trial_end));
  });

  it("legacy reports and exports honor the Free history window", async () => {
    enableBilling();
    const { user, auth } = await freeUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
    for (const [from, to] of [[at(30), at(29.9)], [at(2), at(1.9)]]) {
      await prisma.timeEntry.create({
        data: { userId: user.id, projectId: p.id, startTime: new Date(from), endTime: new Date(to), duration: 8640, isRunning: false, hourlyRateSnapshot: 100 },
      });
    }
    const range = `startDate=${encodeURIComponent(at(60))}&endDate=${encodeURIComponent(new Date().toISOString())}`;
    const summary = await api().get(`/reports/summary?${range}`).set(auth);
    expect(summary.body.limitedByPlan).toMatchObject({ historyDays: 14 });
    const detailed = await api().get(`/reports/detailed?${range}`).set(auth);
    expect(JSON.stringify(detailed.body)).not.toContain(at(30).slice(0, 13));
    const csv = await api().get(`/reports/export?${range}`).set(auth);
    expect(csv.headers["x-limited-by-plan-days"]).toBe("14");
    expect(csv.text.trim().split("\n")).toHaveLength(2); // header + the recent entry
  });

  it("relabeling running work as AI counts toward the Free agent cap", async () => {
    enableBilling();
    const { user, auth } = await freeUser();
    const key = await createApiKey(user.id);
    await api().post("/timers").set(key.auth).send({});
    await api().post("/timers").set(key.auth).send({});
    const human = await api().post("/timers").set(auth).send({ isAiGenerated: false });
    expect(human.status).toBe(201);
    const flip = await api().patch(`/timers/${human.body.timer.id}`).set(auth).send({ isAiGenerated: true });
    expect(flip.status).toBe(402);
    const bulk = await api()
      .post("/time-entries/bulk-update")
      .set(auth)
      .send({ ids: [human.body.entry.id], set: { isAiGenerated: true } });
    expect(bulk.status).toBe(402);
  });

  it("accounts created before billing was on get their trial when it turns on", async () => {
    disableBilling();
    const captcha = await api().get("/auth/captcha");
    const captchaId = captcha.body.captchaId ?? captcha.body.id;
    const res = await api()
      .post("/auth/register")
      .send({ name: "Early", email: "early@dev.test", password: "hunter22!", captchaId, captchaValue: "abcd" });
    expect(res.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "early@dev.test" } })).trialEndsAt).toBeNull();
    enableBilling();
    const status = await api().get("/billing/status").set("Authorization", `Bearer ${res.body.token}`);
    expect(status.body).toMatchObject({ plan: "pro", reason: "trial" });
    const days = (new Date(status.body.trialEndsAt).getTime() - Date.now()) / day;
    expect(days).toBeGreaterThan(13.9);
  });

  it("clipped Free timesheets start at a local day and say so in Markdown and CSV", async () => {
    enableBilling();
    const { user, auth } = await freeUser();
    const p = await createProject(user.id, { name: "Acme" });
    await prisma.timeEntry.create({
      data: { userId: user.id, projectId: p.id, startTime: new Date(at(3)), endTime: new Date(at(2.9)), duration: 8640, isRunning: false },
    });
    const q = `startDate=${encodeURIComponent(at(40))}&projectId=${p.id}&timezone=Europe/Madrid`;
    const json = await api().get(`/reports/timesheet?${q}`).set(auth);
    const start = new Date(json.body.timesheet.range.startDate);
    const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
    expect(local).toBe("00:00");
    const md = await api().get(`/reports/timesheet?${q}&format=markdown`).set(auth);
    expect(md.text).toContain("Free plan: only the last 14 days are included");
    const csv = await api().get(`/reports/timesheet?${q}&format=csv`).set(auth);
    expect(csv.text).toContain("Note: Free plan");
  });
});
