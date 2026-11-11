// Regression tests for the S6 review's API-side findings.
jest.mock("svg-captcha", () => ({ create: () => ({ text: "abcd", data: "<svg/>" }) }));

import { prisma } from "../../utils/database";
import { api, resetDb, createUser, createProject, disconnect } from "../../test/helpers";

beforeEach(resetDb);
afterAll(disconnect);

describe("S6 review: API", () => {
  it("login returns the same profile fields as /auth/me", async () => {
    const captcha = await api().get("/auth/captcha");
    const captchaId = captcha.body.captchaId ?? captcha.body.id;
    const reg = await api()
      .post("/auth/register")
      .send({ name: "Eve", email: "eve@dev.test", password: "hunter22!", captchaId, captchaValue: "abcd" });
    expect(reg.status).toBe(201);
    await prisma.user.update({
      where: { email: "eve@dev.test" },
      data: { currency: "EUR", overlapMode: "sum", agentIdleTimeoutSeconds: 1800 },
    });
    const captcha2 = await api().get("/auth/captcha");
    const login = await api()
      .post("/auth/login")
      .send({ email: "eve@dev.test", password: "hunter22!", captchaId: captcha2.body.captchaId ?? captcha2.body.id, captchaValue: "abcd" });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ currency: "EUR", overlapMode: "sum", agentIdleTimeoutSeconds: 1800 });
  });

  it("the public view never includes the link's private name", async () => {
    const { user, auth } = await createUser();
    await createProject(user.id, { name: "Acme" });
    const made = await api().post("/share-links").set(auth).send({ name: "Acme — overdue, chase!", rollingDays: 7 });
    const token = made.body.url.split("/share/")[1];
    const res = await api().get(`/public/timesheets/${token}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("overdue");
  });

  it("zero-decimal currencies: rows are whole units that add up to the total", async () => {
    const { user, auth } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { currency: "JPY" } });
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 1750 });
    for (const h of ["09", "11", "13"]) {
      await prisma.timeEntry.create({
        data: {
          userId: user.id,
          projectId: p.id,
          startTime: new Date(`2026-03-02T${h}:00:00Z`),
          endTime: new Date(`2026-03-02T${h}:20:00Z`),
          duration: 1200,
          isRunning: false,
          hourlyRateSnapshot: 1750,
        },
      });
    }
    const res = await api().get("/reports/timesheet?startDate=2026-03-01T00:00:00Z&endDate=2026-03-08T00:00:00Z").set(auth);
    const sheet = res.body.timesheet.projects[0];
    const amounts = sheet.lines.map((l: { amount: number }) => l.amount);
    expect(amounts.every((a: number) => Number.isInteger(a))).toBe(true);
    expect(amounts.reduce((s: number, a: number) => s + a, 0)).toBe(sheet.totals.timeAmount);
    expect(sheet.totals.timeAmount).toBe(1750);
  });

  it("three-decimal currencies: project and sheet totals keep the third decimal", async () => {
    const { user, auth } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { currency: "KWD" } });
    // One whole hour each, so each row is exactly the rate.
    for (const [name, rate, h] of [["Acme", 1.001, 9], ["Globex", 1.234, 11]] as const) {
      const p = await createProject(user.id, { name, hourlyRate: rate });
      await prisma.timeEntry.create({
        data: {
          userId: user.id,
          projectId: p.id,
          startTime: new Date(Date.UTC(2026, 2, 2, h)),
          endTime: new Date(Date.UTC(2026, 2, 2, h + 1)),
          duration: 3600,
          isRunning: false,
          hourlyRateSnapshot: rate,
        },
      });
    }
    const res = await api().get("/reports/timesheet?startDate=2026-03-01T00:00:00Z&endDate=2026-03-08T00:00:00Z").set(auth);
    const t = res.body.timesheet;
    const byName = Object.fromEntries(t.projects.map((p: { project: { name: string }; totals: { amount: number } }) => [p.project.name, p.totals.amount]));
    expect(byName).toEqual({ Acme: 1.001, Globex: 1.234 });
    expect(t.totals.amount).toBe(2.235);
  });
});

