// Regression tests for the release review of the AI-first release (#169).
import { prisma } from "../../utils/database";
import { api, resetDb, createUser, createApiKey, createProject, createTask, disconnect } from "../../test/helpers";

beforeEach(resetDb);
afterAll(disconnect);

const RANGE = "startDate=2026-03-01T00:00:00Z&endDate=2026-03-08T00:00:00Z";
const at = (hhmm: string) => new Date(`2026-03-02T${hhmm}:00Z`);

/** A stopped agent timer for `projectId` with the given segments. */
async function agentTimer(userId: string, projectId: string, description: string, segments: Array<[string, string]>, costUsd?: number) {
  const timer = await prisma.timer.create({
    data: {
      userId,
      projectId,
      description,
      status: "stopped",
      agent: "claude_code",
      isAiGenerated: true,
      createdVia: "agent_hook",
      sessionKey: `s-${description}`,
      startedAt: at(segments[0][0]),
      stoppedAt: at(segments[segments.length - 1][1]),
      costUsd: costUsd ?? null,
    },
  });
  const entries = [];
  for (const [a, b] of segments) {
    entries.push(
      await prisma.timeEntry.create({
        data: {
          userId,
          projectId,
          timerId: timer.id,
          description,
          startTime: at(a),
          endTime: at(b),
          duration: (at(b).getTime() - at(a).getTime()) / 1000,
          isRunning: false,
          isAiGenerated: true,
          hourlyRateSnapshot: 100,
        },
      })
    );
  }
  return { timer, entries };
}

describe("release review: timesheets follow segments, not timers", () => {
  it("a segment moved to another client takes no description, notes or costs from its old client", async () => {
    const { user, auth } = await createUser();
    const a = await createProject(user.id, { name: "Client A", hourlyRate: 100, includeAiCosts: true });
    const b = await createProject(user.id, { name: "Client B", hourlyRate: 100, includeAiCosts: true });
    const { timer, entries } = await agentTimer(user.id, b.id, "clientb/secret-merger", [["09:00", "10:00"], ["11:00", "13:00"]], 45);
    await prisma.timerNote.create({ data: { userId: user.id, timerId: timer.id, body: "B confidential", createdAt: at("11:30") } });
    // The first hour was really for client A.
    const moved = await api()
      .put(`/time-entries/${entries[0].id}`)
      .set(auth)
      .send({ projectId: a.id, description: "Client A onboarding" });
    expect(moved.status).toBe(200);

    const sheet = (await api().get(`/reports/timesheet?${RANGE}&format=json`).set(auth)).body.timesheet;
    const byName = Object.fromEntries(sheet.projects.map((p: { project: { name: string } }) => [p.project.name, p]));
    const aText = JSON.stringify(byName["Client A"]);
    expect(aText).not.toContain("secret-merger");
    expect(aText).not.toContain("B confidential");
    expect(byName["Client A"].lines.map((l: { description: string }) => l.description)).toEqual(["Client A onboarding"]);
    expect(byName["Client B"].lines[0].notes).toEqual(["B confidential"]);
    // $45 split by tracked time: 1h on A, 2h on B.
    expect(byName["Client A"].costs.map((c: { costUsd: number }) => c.costUsd)).toEqual([15]);
    expect(byName["Client B"].costs.map((c: { costUsd: number }) => c.costUsd)).toEqual([30]);
    expect(byName["Client A"].costs[0].description).toBe("Client A onboarding");
  });

  it("an edited description shows on the invoice, not the timer's old text", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
    const started = await api().post("/time-entries/start").set(auth).send({ projectId: p.id, description: "tpyo meeting" });
    const id = started.body.timeEntry.id;
    await prisma.timeEntry.update({ where: { id }, data: { startTime: at("09:00") } });
    await api().post(`/time-entries/${id}/stop`).set(auth).send({ endTime: at("10:00").toISOString() });
    expect((await api().put(`/time-entries/${id}`).set(auth).send({ description: "Kickoff meeting" })).status).toBe(200);
    const md = await api().get(`/reports/timesheet?${RANGE}&format=markdown`).set(auth);
    expect(md.text).toContain("Kickoff meeting");
    expect(md.text).not.toContain("tpyo");
  });

  it("a note written after the last segment ended stays on that segment's line", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
    const { timer } = await agentTimer(user.id, p.id, "wrap-up", [["09:00", "10:00"]]);
    await prisma.timerNote.create({ data: { userId: user.id, timerId: timer.id, body: "Shipped v2", createdAt: at("10:05") } });
    const sheet = (await api().get(`/reports/timesheet?${RANGE}&format=json`).set(auth)).body.timesheet;
    expect(sheet.projects[0].lines[0].notes).toEqual(["Shipped v2"]);
  });
});

describe("release review: older task-only entries", () => {
  it("editing only the text keeps the task and its rate", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme" });
    const task = await createTask(user.id, p.id, { hourlyRate: 120 });
    // Older clients could start a timer with a task and no project.
    const entry = await prisma.timeEntry.create({
      data: { userId: user.id, taskId: task.id, startTime: at("09:00"), endTime: at("10:00"), duration: 3600, isRunning: false, hourlyRateSnapshot: 120 },
    });
    const res = await api().put(`/time-entries/${entry.id}`).set(auth).send({ description: "Planning" });
    expect(res.status).toBe(200);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after).toMatchObject({ taskId: task.id, hourlyRateSnapshot: 120, description: "Planning" });
  });

  it("renaming a task-only timer keeps its task", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme" });
    const task = await createTask(user.id, p.id, { hourlyRate: 120 });
    const timer = await prisma.timer.create({
      data: { userId: user.id, taskId: task.id, status: "stopped", startedAt: at("09:00"), stoppedAt: at("10:00") },
    });
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: task.id, timerId: timer.id, startTime: at("09:00"), endTime: at("10:00"), duration: 3600, isRunning: false, hourlyRateSnapshot: 120 },
    });
    expect((await api().patch(`/timers/${timer.id}`).set(auth).send({ description: "Planning" })).status).toBe(200);
    expect(await prisma.timer.findUniqueOrThrow({ where: { id: timer.id } })).toMatchObject({ taskId: task.id });
    expect(await prisma.timeEntry.findFirstOrThrow({ where: { timerId: timer.id } })).toMatchObject({ taskId: task.id, hourlyRateSnapshot: 120 });
  });
});

describe("release review: imports", () => {
  it("usage on an import has the same 20-model cap as live usage", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`model-${i}`, { inputTokens: 1 }]));
    const res = await api()
      .post("/agent-sessions/import")
      .set(key.auth)
      .send({
        sessions: [
          { sessionKey: "bomb", spans: [["2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z"]], usage: many },
          { sessionKey: "fine", spans: [["2026-03-02T11:00:00Z", "2026-03-02T12:00:00Z"]], usage: { "claude-opus-5-5": { inputTokens: 10 } } },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s: { status: string }) => s.status)).toEqual(["invalid", "imported"]);
    expect(await prisma.timer.count({ where: { sessionKey: "bomb" } })).toBe(0);
  });

  it("afterTrackedWork starts after AI work tracked another way, so it isn't billed twice", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    // An older MCP setup tracked AI work until 10:00 (no session id).
    await prisma.timeEntry.create({
      data: { userId: user.id, startTime: at("09:00"), endTime: at("10:00"), duration: 3600, isRunning: false, isAiGenerated: true },
    });
    // A hook-tracked session (with a session id) doesn't move that line.
    await agentTimer(user.id, (await createProject(user.id, { name: "Acme" })).id, "hooked", [["13:00", "14:00"]]);
    const sessions = [
      { sessionKey: "straddles", spans: [["2026-03-02T09:00:00Z", "2026-03-02T09:30:00Z"], ["2026-03-02T09:50:00Z", "2026-03-02T11:00:00Z"]] },
      { sessionKey: "before", spans: [["2026-03-02T08:00:00Z", "2026-03-02T08:30:00Z"]] },
    ];
    const res = await api().post("/agent-sessions/import").set(key.auth).send({ afterTrackedWork: true, sessions });
    expect(res.body.trackedUntil).toBe("2026-03-02T10:00:00.000Z");
    expect(res.body.sessions.map((s: { status: string }) => s.status)).toEqual(["imported", "skipped_tracked"]);
    expect(res.body.sessions[0]).toMatchObject({ startedAt: "2026-03-02T10:00:00.000Z", trackedSeconds: 3600 });
    // Without the flag, everything in the window is imported (an explicit choice).
    const all = await api().post("/agent-sessions/import").set(key.auth).send({ dryRun: true, sessions: [sessions[1]] });
    expect(all.body.sessions[0].status).toBe("imported");
    expect(all.body.trackedUntil).toBeNull();
  });
});
