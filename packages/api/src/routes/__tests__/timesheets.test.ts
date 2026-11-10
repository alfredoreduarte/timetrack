import { prisma } from "../../utils/database";
import { api, resetDb, createUser, createApiKey, createProject, disconnect } from "../../test/helpers";
import { csvCell } from "../../billing/render";

beforeEach(resetDb);
afterAll(disconnect);

// A fixed past Monday so "now" never clips the data.
const D = (h: number, m = 0) => new Date(Date.UTC(2026, 2, 2, h, m)).toISOString();
const RANGE = "startDate=2026-03-01T00:00:00Z&endDate=2026-03-08T00:00:00Z";

async function seed() {
  const { user, auth } = await createUser({ name: "Ada Dev", defaultHourlyRate: 100, aiMultiplier: 1 });
  const key = await createApiKey(user.id, { name: "Claude Code" });
  const acme = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
  const globex = await createProject(user.id, { name: "Globex", hourlyRate: 80, overlapMode: "sum" });

  // Acme: three parallel agents (A 9:00–10:30, B 9:30–10:00, C 10:15–11:00) + human review 11:00–11:30.
  const mk = async (desc: string, from: string, to: string, projectId: string, ai: boolean) => {
    const start = await api()
      .post("/timers")
      .set(ai ? key.auth : auth)
      .send({ description: desc, projectId, sessionKey: `${desc}-${from}` });
    const timerId = start.body.timer.id;
    // Move the timer's segment into the fixed past window.
    await prisma.timeEntry.updateMany({
      where: { timerId },
      data: { startTime: new Date(from), endTime: new Date(to), isRunning: false, duration: (new Date(to).getTime() - new Date(from).getTime()) / 1000 },
    });
    await prisma.timer.update({ where: { id: timerId }, data: { status: "stopped", startedAt: new Date(from) } });
    return timerId;
  };
  const a = await mk("Agent A: API pagination", D(9), D(10, 30), acme.id, true);
  await mk("Agent B: tests", D(9, 30), D(10), acme.id, true);
  await mk("Agent C: docs", D(10, 15), D(11), acme.id, true);
  await mk("Code review", D(11), D(11, 30), acme.id, false);
  await mk("Globex agent 1", D(14), D(15), globex.id, true);
  await mk("Globex agent 2", D(14, 30), D(15, 30), globex.id, true);
  await prisma.timerNote.create({ data: { timerId: a, userId: user.id, body: "Added cursor pagination", createdAt: new Date(D(10)) } });
  return { user, auth, key, acme, globex, timerA: a };
}

describe("GET /reports/timesheet", () => {
  it("bills parallel agents once on dedupe projects and in full on sum projects", async () => {
    const { auth, acme, globex } = await seed();
    const res = await api().get(`/reports/timesheet?${RANGE}`).set(auth);
    expect(res.status).toBe(200);
    const t = res.body.timesheet;
    const acmeSheet = t.projects.find((p: any) => p.project?.id === acme.id);
    const globexSheet = t.projects.find((p: any) => p.project?.id === globex.id);

    expect(acmeSheet.totals).toMatchObject({
      trackedSeconds: 3.25 * 3600, // 2h45 agents + 30m human
      wallClockSeconds: 2.5 * 3600,
      billedSeconds: 2.5 * 3600,
      agentTrackedSeconds: 2.75 * 3600,
      humanTrackedSeconds: 0.5 * 3600,
      amount: 250,
    });
    expect(acmeSheet.totals.parallelism).toBeCloseTo(1.3, 1);
    expect(acmeSheet.disclosure.join(" ")).toMatch(/overlapping time is billed once/);
    expect(acmeSheet.disclosure.join(" ")).toMatch(/standard rate/);

    expect(globexSheet.totals).toMatchObject({ billedSeconds: 2 * 3600, wallClockSeconds: 1.5 * 3600, amount: 160 });
    expect(globexSheet.disclosure.join(" ")).toMatch(/billed per session/);
    expect(t.totals).toMatchObject({ billedSeconds: 4.5 * 3600, amount: 410 });

    const lineA = acmeSheet.lines.find((l: any) => l.description === "Agent A: API pagination");
    expect(lineA).toMatchObject({ date: "2026-03-02", kind: "agent", trackedSeconds: 5400, notes: ["Added cursor pagination"] });
    const human = acmeSheet.lines.find((l: any) => l.kind === "human");
    expect(human).toMatchObject({ description: "Code review", billedSeconds: 1800, amount: 50 });
  });

  it("applies project policies: flat agent rate, multipliers, cost pass-through with markup", async () => {
    const { auth, acme, timerA } = await seed();
    await api().put(`/projects/${acme.id}`).set(auth).send({ agentHourlyRate: 40, includeAiCosts: true, aiCostMarkupPercent: 10 });
    await api()
      .post(`/timers/${timerA}/usage`)
      .set(auth)
      .send({ usage: { "claude-opus-5-5": { inputTokens: 1_000_000, outputTokens: 500_000 } } }); // $4 + $10
    const res = await api().get(`/reports/timesheet?${RANGE}&projectId=${acme.id}`).set(auth);
    const sheet = res.body.timesheet.projects[0];
    // 2h agent wall-clock at $40 + 30m human at $100
    expect(sheet.totals.timeAmount).toBeCloseTo(130);
    expect(sheet.costs).toEqual([expect.objectContaining({ costUsd: 14, billedUsd: 15.4 })]);
    expect(sheet.totals.amount).toBeCloseTo(145.4);
    expect(sheet.disclosure.join(" ")).toMatch(/flat agent rate of \$40\.00\/h/);
    expect(sheet.disclosure.join(" ")).toMatch(/10% handling fee/);
  });

  it("clips entries to the range and in the user's timezone", async () => {
    const { auth, acme } = await seed();
    // 2026-03-02 09:00–10:30 UTC; range starts 09:30 UTC
    const res = await api()
      .get(`/reports/timesheet?startDate=2026-03-02T09:30:00Z&endDate=2026-03-02T10:00:00Z&projectId=${acme.id}`)
      .set(auth);
    expect(res.body.timesheet.projects[0].totals.wallClockSeconds).toBe(1800);
    const tokyo = await api().get(`/reports/timesheet?${RANGE}&timezone=Asia/Tokyo`).set(auth);
    // 14:00 UTC is 23:00 in Tokyo; 15:30 UTC crosses into 2026-03-03.
    const globexDays = tokyo.body.timesheet.projects
      .find((p: any) => p.project?.name === "Globex")
      .lines.map((l: any) => l.date);
    expect(new Set(globexDays)).toEqual(new Set(["2026-03-02", "2026-03-03"]));
    expect((await api().get(`/reports/timesheet?${RANGE}&timezone=Mars/Olympus`).set(auth)).status).toBe(400);
  });

  it("renders Markdown and CSV, neutralizing spreadsheet formulas", async () => {
    const { auth, acme } = await seed();
    await prisma.timer.updateMany({ where: { description: "Code review" }, data: { description: "=HYPERLINK(\"http://evil\")" } });
    const md = await api().get(`/reports/timesheet?${RANGE}&format=markdown`).set(auth);
    expect(md.headers["content-type"]).toMatch(/markdown/);
    expect(md.text).toContain("# Timesheet — Ada Dev");
    expect(md.text).toContain("## Acme");
    expect(md.text).toMatch(/\| 2026-03-02 \| Agent A: API pagination • Added cursor pagination \| AI agent \| 1:30 \|/);
    expect(md.text).toContain("> When several agents worked on this project at the same time");

    const csv = await api().get(`/reports/timesheet?${RANGE}&format=csv&projectId=${acme.id}`).set(auth);
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell('say "hi"')).toBe(`"say ""hi"""`);
  });

  it("is scoped to the caller", async () => {
    await seed();
    const other = await createUser();
    const res = await api().get(`/reports/timesheet?${RANGE}`).set(other.auth);
    expect(res.body.timesheet.projects).toEqual([]);
    const acme = await prisma.project.findFirstOrThrow({ where: { name: "Acme" } });
    expect((await api().get(`/reports/timesheet?${RANGE}&projectId=${acme.id}`).set(other.auth)).status).toBe(404);
  });
});

describe("share links", () => {
  it("serves a redacted, id-free client view and honours revocation", async () => {
    const { auth, acme } = await seed();
    const created = await api()
      .post("/share-links")
      .set(auth)
      .send({ name: "Acme — March", projectId: acme.id, startDate: "2026-03-01T00:00:00Z", endDate: "2026-03-08T00:00:00Z", showAmounts: false });
    expect(created.status).toBe(201);
    expect(created.body.url).toMatch(/\/share\/ts_[0-9a-f]{48}$/);
    const token = created.body.token;

    const view = await api().get(`/public/timesheets/${token}`);
    expect(view.status).toBe(200);
    const sheet = view.body.timesheet.projects[0];
    expect(sheet.totals.billedSeconds).toBe(2.5 * 3600);
    expect(sheet.totals.amount).toBe(0);
    expect(sheet.lines.every((l: any) => l.amount === 0 && l.rate === 0 && l.entryIds.length === 0 && l.timerId === null)).toBe(true);
    expect(sheet.disclosure.join(" ")).not.toMatch(/rate/);
    const raw = JSON.stringify(view.body);
    const ids = await prisma.timeEntry.findMany({ select: { id: true, userId: true } });
    for (const { id, userId } of ids) {
      expect(raw).not.toContain(id);
      expect(raw).not.toContain(userId);
    }

    const md = await api().get(`/public/timesheets/${token}?format=markdown`);
    expect(md.text).not.toMatch(/\$/);

    const list = await api().get("/share-links").set(auth);
    expect(list.body.shareLinks[0]).toMatchObject({ viewCount: 2, name: "Acme — March" });
    expect(JSON.stringify(list.body)).not.toContain(token);

    await api().delete(`/share-links/${created.body.shareLink.id}`).set(auth);
    expect((await api().get(`/public/timesheets/${token}`)).status).toBe(404);
  });

  it("supports rolling windows, expiry and rejects bad tokens", async () => {
    const { auth } = await seed();
    const rolling = await api().post("/share-links").set(auth).send({ rollingDays: 30 });
    expect(rolling.status).toBe(201);
    expect((await api().get(`/public/timesheets/${rolling.body.token}`)).status).toBe(200);

    const expiring = await api()
      .post("/share-links")
      .set(auth)
      .send({ rollingDays: 7, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await prisma.shareLink.update({ where: { id: expiring.body.shareLink.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api().get(`/public/timesheets/${expiring.body.token}`)).status).toBe(404);

    expect((await api().get("/public/timesheets/ts_deadbeef")).status).toBe(404);
    expect((await api().get("/public/timesheets/whatever")).status).toBe(404);
    expect((await api().post("/share-links").set(auth).send({ rollingDays: 7, startDate: D(0) })).status).toBe(400);
    expect((await api().post("/share-links").set(auth).send({})).status).toBe(400);
  });

  it("can't be revoked or created for someone else's project", async () => {
    const { auth, acme } = await seed();
    const other = await createUser();
    const link = await api().post("/share-links").set(auth).send({ rollingDays: 7 });
    expect((await api().delete(`/share-links/${link.body.shareLink.id}`).set(other.auth)).status).toBe(404);
    expect((await api().post("/share-links").set(other.auth).send({ rollingDays: 7, projectId: acme.id })).status).toBe(404);
  });
});

describe("POST /timers/:id/usage", () => {
  it("replaces or adds token totals and recomputes cost", async () => {
    const { auth } = await createUser();
    const t = await api().post("/timers").set(auth).send({});
    const id = t.body.timer.id;
    const first = await api().post(`/timers/${id}/usage`).set(auth).send({ usage: { "claude-sonnet-5-5": { inputTokens: 1_000_000 } } });
    expect(first.body.costUsd).toBeCloseTo(2);
    const again = await api().post(`/timers/${id}/usage`).set(auth).send({ usage: { "claude-sonnet-5-5": { inputTokens: 1_000_000 } } });
    expect(again.body.costUsd).toBeCloseTo(2); // replace is idempotent
    const added = await api()
      .post(`/timers/${id}/usage`)
      .set(auth)
      .send({ mode: "add", usage: { "claude-sonnet-5-5": { outputTokens: 100_000 }, "some-other-model": { inputTokens: 5 } } });
    expect(added.body.costUsd).toBeCloseTo(3);
    expect(added.body.unpricedModels).toEqual(["some-other-model"]);
    expect((await api().post(`/timers/${id}/usage`).set(auth).send({ usage: { x: { inputTokens: -1 } } })).status).toBe(400);
  });
});
