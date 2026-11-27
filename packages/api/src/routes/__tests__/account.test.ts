import bcrypt from "bcryptjs";
import Stripe from "stripe";
import { prisma } from "../../utils/database";
import { setStripeClient } from "../../billing/stripeClient";
import { api, resetDb, createUser, createApiKey, createProject, disconnect } from "../../test/helpers";

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
});
