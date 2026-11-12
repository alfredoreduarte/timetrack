// Regression tests for the S3 adversarial review findings.
import { prisma } from "../../utils/database";
import { api, resetDb, createUser, createApiKey, createProject, disconnect } from "../../test/helpers";
import { billProject } from "../../billing/engine";
import { canonicalTimezone, localDateKey, startOfLocalDay } from "../../billing/time";
import { resolveRange, splitCents } from "../../services/timesheets";

beforeEach(resetDb);
afterAll(disconnect);

const RANGE = "startDate=2026-03-01T00:00:00Z&endDate=2026-03-08T00:00:00Z";

async function entry(
  userId: string,
  projectId: string,
  from: string,
  to: string,
  opts: { ai?: boolean; rate?: number; timerId?: string } = {}
) {
  return prisma.timeEntry.create({
    data: {
      userId,
      projectId,
      startTime: new Date(from),
      endTime: new Date(to),
      duration: Math.round((Date.parse(to) - Date.parse(from)) / 1000),
      isRunning: false,
      isAiGenerated: opts.ai ?? false,
      hourlyRateSnapshot: opts.rate ?? 100,
      timerId: opts.timerId,
      description: "Work",
    },
  });
}

async function aiTimer(userId: string, projectId: string, from: string, to: string, costUsd: number) {
  const timer = await prisma.timer.create({
    data: {
      userId,
      projectId,
      status: "stopped",
      description: "Agent session",
      agent: "claude_code",
      isAiGenerated: true,
      createdVia: "claude_code",
      startedAt: new Date(from),
      stoppedAt: new Date(to),
      lastActivityAt: new Date(to),
      costUsd,
    },
  });
  await entry(userId, projectId, from, to, { ai: true, timerId: timer.id });
  return timer;
}

describe("S3 review: client views", () => {
  it("an hours-only share link exposes no money or billing policy", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, {
      name: "Acme",
      hourlyRate: 100,
      aiMultiplier: 2.5,
      agentHourlyRate: 175,
      includeAiCosts: true,
      aiCostMarkupPercent: 35,
    });
    await aiTimer(user.id, p.id, "2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z", 12.34);
    const link = await api()
      .post("/share-links")
      .set(auth)
      .send({ startDate: "2026-03-01T00:00:00Z", endDate: "2026-03-08T00:00:00Z", showAmounts: false });
    expect(link.status).toBe(201);
    const token = link.body.url.split("/share/")[1];
    const res = await api().get(`/public/timesheets/${token}`);
    expect(res.status).toBe(200);
    // generatedAt is the clock (it could contain "35" or "175" by chance).
    const { generatedAt: _clock, ...sheet } = res.body.timesheet;
    const json = JSON.stringify({ ...res.body, timesheet: sheet });
    for (const leak of ["175", "2.5", "35", "12.34", "agentHourlyRate", "aiMultiplier", "aiCostMarkupPercent", user.id, p.id]) {
      expect([leak, json.includes(leak)]).toEqual([leak, false]);
    }
    expect(res.body.timesheet.projects[0].policy).toEqual({ overlapMode: "dedupe" });
    expect(res.body.timesheet.projects[0].totals.billedSeconds).toBe(3600);
  });

  it("key-created share links die with the key", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme" });
    await entry(user.id, p.id, "2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z");
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const made = await api().post("/share-links").set(key.auth).send({ rollingDays: 30 });
    const token = made.body.url.split("/share/")[1];
    expect((await api().get(`/public/timesheets/${token}`)).status).toBe(200);

    await prisma.apiKey.update({ where: { id: key.id }, data: { isActive: false } });
    expect((await api().get(`/public/timesheets/${token}`)).status).toBe(404);

    await prisma.apiKey.update({ where: { id: key.id }, data: { isActive: true } });
    expect((await api().delete(`/api-keys/${key.id}`).set(auth)).status).toBe(200);
    expect((await api().get(`/public/timesheets/${token}`)).status).toBe(404);
    const links = await prisma.shareLink.findMany({ where: { userId: user.id } });
    expect(links.every((l) => l.revokedAt !== null)).toBe(true);
  });

  it("rejects share links that could never be opened; old open-ended links still open", async () => {
    const { user, auth } = await createUser();
    const tooLong = await api()
      .post("/share-links")
      .set(auth)
      .send({ startDate: "2024-01-01T00:00:00Z", endDate: "2026-01-01T00:00:00Z" });
    expect(tooLong.status).toBe(400);
    const future = await api().post("/share-links").set(auth).send({ startDate: "2099-01-01T00:00:00Z" });
    expect(future.status).toBe(400);

    await createProject(user.id, { name: "Acme" });
    const openEnded = await api().post("/share-links").set(auth).send({ startDate: "2024-01-01T00:00:00Z" });
    expect(openEnded.status).toBe(201);
    const token = openEnded.body.url.split("/share/")[1];
    expect((await api().get(`/public/timesheets/${token}`)).status).toBe(200);
  });
});

describe("S3 review: money", () => {
  it("USD AI costs are listed but not added to a non-USD total", async () => {
    const { user, auth } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { currency: "EUR" } });
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100, includeAiCosts: true });
    await aiTimer(user.id, p.id, "2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z", 20);

    const res = await api().get(`/reports/timesheet?${RANGE}`).set(auth);
    const sheet = res.body.timesheet.projects[0];
    expect(sheet.totals).toMatchObject({ timeAmount: 100, costsAmount: 0, costsBilledUsd: 20, costsIncluded: false, amount: 100 });
    expect(res.body.timesheet.totals.amount).toBe(100);
    expect(sheet.disclosure.join(" ")).toContain("not included in the EUR total");

    const md = await api().get(`/reports/timesheet?${RANGE}&format=markdown`).set(auth);
    expect(md.text).toContain("$20.00 (USD, not included in the total)");
    expect(md.text).not.toContain("€20.00");
  });

  it("USD sheets still add costs to the total", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100, includeAiCosts: true, aiCostMarkupPercent: 10 });
    await aiTimer(user.id, p.id, "2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z", 20);
    const res = await api().get(`/reports/timesheet?${RANGE}`).set(auth);
    expect(res.body.timesheet.projects[0].totals).toMatchObject({ costsAmount: 22, costsIncluded: true, amount: 122 });
  });

  it("invoice rows always add up to the printed total", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 95 });
    // Three 7-minute entries at $95/h: 11.0833 each.
    for (const h of ["09", "11", "13"]) {
      await entry(user.id, p.id, `2026-03-02T${h}:00:00Z`, `2026-03-02T${h}:07:00Z`, { rate: 95 });
    }
    // Ten one-second entries at $100/h.
    for (let i = 0; i < 10; i++) {
      const s = `2026-03-03T09:00:${String(i * 2).padStart(2, "0")}Z`;
      const e = `2026-03-03T09:00:${String(i * 2 + 1).padStart(2, "0")}Z`;
      await entry(user.id, p.id, s, e);
    }
    const res = await api().get(`/reports/timesheet?${RANGE}`).set(auth);
    const sheet = res.body.timesheet.projects[0];
    const sum = sheet.lines.reduce((s: number, l: { amount: number }) => s + Math.round(l.amount * 100), 0);
    expect(sum).toBe(Math.round(sheet.totals.timeAmount * 100));
    expect(sheet.totals.timeAmount).toBeCloseTo(33.25 + 0.28, 2);
    expect(splitCents([0.0278, 0.0278, 0.0278])).toEqual([3, 3, 2]);
  });
});

describe("S3 review: time and dates", () => {
  it("canonicalizes timezone names and echoes the canonical one", async () => {
    const { auth } = await createUser();
    const res = await api().get(`/reports/timesheet?${RANGE}&timezone=aMeRiCa/nEw_YoRk`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.timesheet.range.timezone).toBe("America/New_York");
    expect(canonicalTimezone("europe/MADRID")).toBe("Europe/Madrid");
    expect(canonicalTimezone("Not/AZone")).toBeNull();
  });

  it("finds the start of days whose midnight doesn't exist", () => {
    for (const [tz, day] of [
      ["America/Havana", "2026-03-08"],
      ["America/Santiago", "2026-09-06"],
    ]) {
      const start = startOfLocalDay(new Date(`${day}T15:00:00Z`), tz);
      expect([tz, localDateKey(start, tz)]).toEqual([tz, day]);
      expect(localDateKey(new Date(start.getTime() - 1), tz)).not.toBe(day);
    }
  });

  it("splits a Havana entry across the skipped midnight correctly", () => {
    const bill = billProject(
      [{ id: "e", start: new Date("2026-03-08T03:00:00Z"), end: new Date("2026-03-08T07:00:00Z"), rate: 100, isAi: false }],
      { overlapMode: "dedupe", aiMultiplier: 1, agentHourlyRate: null, includeAiCosts: false, aiCostMarkupPercent: 0 },
      "America/Havana"
    );
    const byDay = Object.fromEntries(Array.from(bill.allocations.get("e")!).map(([d, a]) => [d, a.trackedMs / 3600_000]));
    expect(byDay).toEqual({ "2026-03-07": 2, "2026-03-08": 2 });
  });

  it("defaults to the 1st of the month even when the 1st has no midnight", () => {
    const { start } = resolveRange({ timezone: "America/Havana" }, new Date("2026-03-15T12:00:00Z"));
    expect(localDateKey(start, "America/Havana")).toBe("2026-03-01");
    expect(() => resolveRange({ startDate: new Date("nope") }, new Date())).toThrow(/valid date/);
  });

  it("Markdown header shows local, inclusive dates", async () => {
    const { auth } = await createUser();
    const res = await api()
      .get("/reports/timesheet?startDate=2026-02-28T15:00:00Z&endDate=2026-03-31T15:00:00Z&timezone=Asia/Tokyo&format=markdown")
      .set(auth);
    expect(res.text).toContain("2026-03-01 → 2026-03-31 · Asia/Tokyo");
  });

  it("MCP timesheet treats bare dates as local days in the requested zone", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const p = await createProject(user.id, { name: "Acme" });
    // 23:30 on Oct 31 in New York (UTC-4) — must not appear on a November sheet.
    await entry(user.id, p.id, "2026-11-01T03:30:00Z", "2026-11-01T03:50:00Z");
    // Nov 8, 10:00 New York — inside an inclusive Nov 1–8 range.
    await entry(user.id, p.id, "2026-11-08T15:00:00Z", "2026-11-08T16:00:00Z");
    const res = await api()
      .post("/mcp")
      .set(key.auth)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "timesheet", arguments: { startDate: "2026-11-01", endDate: "2026-11-08", timezone: "America/New_York", format: "json" } },
      });
    const result = res.body.result;
    expect(result.isError).toBeFalsy();
    const sheet = JSON.parse(result.content[0].text);
    const dates = (sheet.timesheet ?? sheet).projects.flatMap((x: { lines: Array<{ date: string }> }) => x.lines.map((l) => l.date));
    expect(dates).toEqual(["2026-11-08"]);
  });
});

describe("S3 review: imports keep costs", () => {
  it("re-importing a session without usage keeps its cost", async () => {
    const { auth } = await createUser();
    const session = (usage?: Record<string, unknown>) => ({
      sessionKey: "s-cost",
      agent: "claude_code",
      spans: [["2026-03-02T09:00:00Z", "2026-03-02T09:20:00Z"]],
      ...(usage ? { usage } : {}),
    });
    await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [session({ "claude-opus-5-5": { inputTokens: 1_000_000, outputTokens: 100_000 } })] });
    const before = await prisma.timer.findFirstOrThrow({ where: { sessionKey: "s-cost" } });
    expect(before.costUsd).toBeGreaterThan(0);
    const again = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session()] });
    expect(again.body.sessions[0].status).toBe("replaced");
    const after = await prisma.timer.findFirstOrThrow({ where: { sessionKey: "s-cost" } });
    expect(after.costUsd).toBe(before.costUsd);
  });
});

describe("S3 re-review fixes", () => {
  it("a bare end date is that local day, inclusive — not a month later", () => {
    const { parseRangeDate } = jest.requireActual("../../services/timesheets");
    const end = parseRangeDate("2026-02-28", "Europe/Madrid", "end");
    expect(end.toISOString()).toBe("2026-02-28T23:00:00.000Z"); // local midnight, Mar 1
    expect(parseRangeDate("2026-12-31", "UTC", "end").toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(() => parseRangeDate("2026-02-30", "UTC", "end")).toThrow(/not a calendar date/);
    expect(() => parseRangeDate("2026-11-01T00:00:00", "UTC", "start")).toThrow(/with a zone/);
    expect(parseRangeDate("2026-11-01T00:00:00+01:00", "UTC", "start").toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("an MCP February sheet doesn't bill March work", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const p = await createProject(user.id, { name: "Acme" });
    await entry(user.id, p.id, "2026-02-27T10:00:00Z", "2026-02-27T11:00:00Z");
    await entry(user.id, p.id, "2026-03-15T10:00:00Z", "2026-03-15T13:00:00Z");
    const res = await api()
      .post("/mcp")
      .set(key.auth)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "timesheet", arguments: { startDate: "2026-02-01", endDate: "2026-02-28", timezone: "Europe/Madrid", format: "json" } },
      });
    const sheet = JSON.parse(res.body.result.content[0].text);
    const t = sheet.timesheet ?? sheet;
    expect(t.projects.flatMap((x: { lines: Array<{ date: string }> }) => x.lines.map((l) => l.date))).toEqual(["2026-02-27"]);
    expect(t.range.endDate).toBe("2026-02-28T23:00:00.000Z");
  });

  it("public views are never served stale", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme" });
    await entry(user.id, p.id, "2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z");
    const made = await api().post("/share-links").set(auth).send({ startDate: "2026-03-01T00:00:00Z", endDate: "2026-03-08T00:00:00Z" });
    const token = made.body.url.split("/share/")[1];
    const before = await api().get(`/public/timesheets/${token}`);
    expect(before.body.timesheet.totals.billedSeconds).toBe(3600);
    await entry(user.id, p.id, "2026-03-03T09:00:00Z", "2026-03-03T10:00:00Z");
    const after = await api().get(`/public/timesheets/${token}`);
    expect(after.body.timesheet.totals.billedSeconds).toBe(7200);
  });
});

describe("S3 review round 3", () => {
  it("impossible dates are rejected in timestamp form too", () => {
    const { parseRangeDate } = jest.requireActual("../../services/timesheets");
    expect(() => parseRangeDate("2026-04-31T23:59:59Z", "UTC", "end")).toThrow(/not a calendar date/);
    expect(() => parseRangeDate("2026-02-29T00:00:00Z", "UTC", "start")).toThrow(/not a calendar date/);
    expect(parseRangeDate("2028-02-29T00:00:00Z", "UTC", "start").toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("one share link has its own view budget, whatever the client IP", async () => {
    const { user, auth } = await createUser();
    await createProject(user.id, { name: "Acme" });
    const made = await api().post("/share-links").set(auth).send({ rollingDays: 7 });
    const token = made.body.url.split("/share/")[1];
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) {
      statuses.push((await api().get(`/public/timesheets/${token}`).set("X-Forwarded-For", `203.0.113.${i}`)).status);
    }
    expect(statuses.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(statuses[12]).toBe(429);
  });
});

describe("S3 review round 4", () => {
  it("tokens that can't exist don't use a link budget (or hold a key)", async () => {
    const junk = `ts_${"x".repeat(5000)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) {
      statuses.push((await api().get(`/public/timesheets/${junk}`).set("X-Forwarded-For", `198.51.100.${i}`)).status);
    }
    expect(statuses.every((s) => s === 404)).toBe(true);
  });

  it("a bad MCP expiresAt is reported as expiresAt", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    await createProject(user.id, { name: "Acme" });
    const call = (expiresAt: string) =>
      api()
        .post("/mcp")
        .set(key.auth)
        .set("Accept", "application/json, text/event-stream")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_share_link", arguments: { rollingDays: 7, expiresAt } },
        });
    for (const bad of ["2027-04-31", "2027-01-01T00:00:00"]) {
      const text = (await call(bad)).body.result.content[0].text as string;
      expect(text).toMatch(/expiresAt/);
      expect(text).not.toMatch(/endDate/);
    }
  });
});
