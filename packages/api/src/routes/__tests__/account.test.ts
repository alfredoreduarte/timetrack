import bcrypt from "bcryptjs";
import Stripe from "stripe";
import { prisma } from "../../utils/database";
import { setStripeClient } from "../../billing/stripeClient";
import { api, resetDb, createUser, createApiKey, createProject, disconnect } from "../../test/helpers";
import { redactTokens } from "../../middleware/errorHandler";

const fake = { customers: { del: jest.fn() } };

beforeEach(async () => {
  await resetDb();
  jest.resetAllMocks();
  setStripeClient(fake as unknown as Stripe);
});
afterAll(async () => {
  setStripeClient(null);
  await disconnect();
});

const PASSWORD = "correct horse battery";
const withPassword = async (overrides: Record<string, unknown> = {}) =>
  createUser({ password: await bcrypt.hash(PASSWORD, 4), ...overrides });

describe("DELETE /users/me", () => {
  it("deletes the account and everything in it", async () => {
    const { user, auth } = await withPassword();
    const other = await withPassword();
    const p = await createProject(user.id, { name: "Acme" });
    await createProject(other.user.id, { name: "Not mine" });
    const key = await createApiKey(user.id);
    const timer = await api().post("/timers").set(auth).send({ projectId: p.id, description: "work" });
    expect(timer.status).toBe(201);
    await api().post(`/timers/${timer.body.timer.id}/notes`).set(auth).send({ body: "a note" });
    await prisma.shareLink.create({ data: { userId: user.id, tokenHash: "h", tokenPrefix: "p", rollingDays: 7 } });

    const res = await api().delete("/users/me").set(auth).send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });

    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    for (const count of [
      prisma.project.count({ where: { userId: user.id } }),
      prisma.timeEntry.count({ where: { userId: user.id } }),
      prisma.timer.count({ where: { userId: user.id } }),
      prisma.timerNote.count({ where: { userId: user.id } }),
      prisma.apiKey.count({ where: { userId: user.id } }),
      prisma.shareLink.count({ where: { userId: user.id } }),
      prisma.auditEvent.count({ where: { userId: user.id } }),
    ]) {
      expect(await count).toBe(0);
    }
    // The agent's key stops working; other accounts are untouched.
    expect((await api().get("/timers").set(key.auth)).status).toBe(401);
    expect(await prisma.project.count({ where: { userId: other.user.id } })).toBe(1);
    expect(fake.customers.del).not.toHaveBeenCalled();
  });

  it("needs the right password and a signed-in session, not an API key", async () => {
    const { user, auth } = await withPassword();
    const key = await createApiKey(user.id);
    expect((await api().delete("/users/me").set(auth).send({ password: "wrong" })).status).toBe(400);
    expect((await api().delete("/users/me").set(auth).send({})).status).toBe(400);
    expect((await api().delete("/users/me").set(key.auth).send({ password: PASSWORD })).status).toBe(403);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
  });

  it("stops billing first: the Stripe customer is deleted, and nothing is deleted if Stripe fails", async () => {
    const { user, auth } = await withPassword({ stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123", subscriptionStatus: "active" });
    fake.customers.del.mockRejectedValueOnce(Object.assign(new Error("Stripe is down"), { statusCode: 500 }));
    const failed = await api().delete("/users/me").set(auth).send({ password: PASSWORD });
    expect(failed.status).toBe(502);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);

    fake.customers.del.mockResolvedValueOnce({ id: "cus_123", deleted: true });
    expect((await api().delete("/users/me").set(auth).send({ password: PASSWORD })).status).toBe(200);
    expect(fake.customers.del).toHaveBeenLastCalledWith("cus_123");
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
  });

  it("a customer already deleted in Stripe doesn't block the deletion", async () => {
    const { user, auth } = await withPassword({ stripeCustomerId: "cus_gone" });
    fake.customers.del.mockRejectedValueOnce(Object.assign(new Error("No such customer"), { code: "resource_missing" }));
    expect((await api().delete("/users/me").set(auth).send({ password: PASSWORD })).status).toBe(200);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
  });

  it("deletes a Stripe customer a checkout attached while the password was being checked", async () => {
    const { user, auth } = await withPassword();
    const realCompare = bcrypt.compare.bind(bcrypt);
    // The checkout's claim lands after the account was read, before it's deleted.
    const spy = jest.spyOn(bcrypt, "compare").mockImplementationOnce(async (pw: string, hash: string) => {
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: "cus_late" } });
      return realCompare(pw, hash);
    });
    try {
      fake.customers.del.mockResolvedValue({ deleted: true });
      expect((await api().delete("/users/me").set(auth).send({ password: PASSWORD })).status).toBe(200);
      expect(fake.customers.del.mock.calls).toEqual([["cus_late"]]);
      expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("two deletions at once both succeed, and the account goes once", async () => {
    const { user, auth } = await withPassword({ stripeCustomerId: "cus_1" });
    fake.customers.del
      .mockResolvedValueOnce({ deleted: true })
      .mockRejectedValueOnce(Object.assign(new Error("No such customer"), { code: "resource_missing" }));
    const [a, b] = await Promise.all([
      api().delete("/users/me").set(auth).send({ password: PASSWORD }),
      api().delete("/users/me").set(auth).send({ password: PASSWORD }),
    ]);
    // The second may find the account already gone (401/404 from auth) or finish the job (200).
    expect([a.status, b.status]).toContain(200);
    for (const s of [a.status, b.status]) expect([200, 401, 404]).toContain(s);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
  });

  it("allows a few password tries per account, then 429", async () => {
    const { auth } = await withPassword();
    const statuses: number[] = [];
    let last: Awaited<ReturnType<ReturnType<typeof api>["delete"]>> | null = null;
    for (let i = 0; i < 11; i++) {
      last = await api().delete("/users/me").set(auth).send({ password: "wrong" });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(last!.body.error).toMatch(/Too many password attempts/);
    // The web app pauses every request on a Retry-After; this limit is only
    // for password checks, so it mustn't send one.
    expect(last!.headers["retry-after"]).toBeUndefined();
    expect(last!.headers["ratelimit"] ?? last!.headers["ratelimit-limit"]).toBeUndefined();
  });
});

describe("password limits and log redaction", () => {
  it("change-password caps new passwords at 100 characters, like sign-up", async () => {
    const { auth } = await withPassword();
    const res = await api().post("/users/change-password").set(auth).send({ currentPassword: PASSWORD, newPassword: "x".repeat(101) });
    expect(res.status).toBe(400);
  });

  it("keeps share link tokens out of logged URLs", () => {
    expect(redactTokens("/share/abcdefSECRETSECRET?x=1")).toBe("/share/abcdef…?x=1");
    expect(redactTokens("/public/timesheets/abcdefSECRET/csv")).toBe("/public/timesheets/abcdef…/csv");
    expect(redactTokens("/timers/123")).toBe("/timers/123");
  });
});
