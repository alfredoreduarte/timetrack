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
      createdVia: "claude_code",
      origin: "agent_hook",
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

describe("release review round 2", () => {
  const atDay = (day: string, hhmm: string) => new Date(`2026-03-${day}T${hhmm}:00Z`);

  it("a cost is spread over the timer's tracked time, so each client and period pays its own part", async () => {
    const { user, auth } = await createUser();
    const a = await createProject(user.id, { name: "Client A", hourlyRate: 100, includeAiCosts: true });
    const b = await createProject(user.id, { name: "Client B", hourlyRate: 100, includeAiCosts: true });
    // Started Sunday 23:00 on A; the Monday segment was later moved to B.
    const timer = await prisma.timer.create({
      data: { userId: user.id, projectId: a.id, status: "stopped", agent: "claude_code", isAiGenerated: true, createdVia: "claude_code", sessionKey: "late", startedAt: atDay("07", "23:00"), stoppedAt: atDay("09", "11:00"), costUsd: 30 },
    });
    for (const [pid, from, to] of [[a.id, atDay("07", "23:00"), atDay("07", "23:30")], [b.id, atDay("09", "10:00"), atDay("09", "11:00")]] as const) {
      await prisma.timeEntry.create({
        data: { userId: user.id, projectId: pid, timerId: timer.id, description: "late", startTime: from, endTime: to, duration: (to.getTime() - from.getTime()) / 1000, isRunning: false, isAiGenerated: true, hourlyRateSnapshot: 100 },
      });
    }
    const costsIn = async (range: string) =>
      (await api().get(`/reports/timesheet?${range}&format=json`).set(auth)).body.timesheet.projects.map(
        (p: { project: { name: string }; costs: Array<{ costUsd: number }> }) => [p.project.name, p.costs.map((c) => c.costUsd)]
      );
    // 30 of the timer's 90 minutes are A's (this week), 60 are B's (next week).
    expect(await costsIn(RANGE)).toEqual([["Client A", [10]]]);
    expect(await costsIn("startDate=2026-03-08T00:00:00Z&endDate=2026-03-15T00:00:00Z")).toEqual([["Client B", [20]]]);
  });

  it("a note written in a pause goes with the segment before it, on that segment's sheet", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
    const { timer } = await agentTimer(user.id, p.id, "spans", [["09:00", "10:00"]]);
    // A segment the day before the range, then the note during the pause.
    await prisma.timeEntry.create({
      data: { userId: user.id, projectId: p.id, timerId: timer.id, description: "spans", startTime: new Date("2026-02-28T22:00:00Z"), endTime: new Date("2026-02-28T23:00:00Z"), duration: 3600, isRunning: false, isAiGenerated: true, hourlyRateSnapshot: 100 },
    });
    await prisma.timerNote.create({ data: { userId: user.id, timerId: timer.id, body: "Picked up after the weekend", createdAt: new Date("2026-03-02T08:30:00Z") } });
    const notesIn = async (range: string) =>
      (await api().get(`/reports/timesheet?${range}&format=json`).set(auth)).body.timesheet.projects.flatMap(
        (p: { lines: Array<{ date: string; notes: string[] }> }) => p.lines.map((l) => [l.date, l.notes])
      );
    // Shown once: with Saturday's segment (written after it), not on Monday's.
    expect(await notesIn("startDate=2026-02-22T00:00:00Z&endDate=2026-03-01T00:00:00Z")).toEqual([["2026-02-28", ["Picked up after the weekend"]]]);
    expect(await notesIn(RANGE)).toEqual([["2026-03-02", []]]);
  });

  it("a note whose segment was deleted never moves to another client's segment", async () => {
    const { user, auth } = await createUser();
    const a = await createProject(user.id, { name: "Client A", hourlyRate: 100 });
    const b = await createProject(user.id, { name: "Client B", hourlyRate: 100 });
    const { timer, entries } = await agentTimer(user.id, a.id, "split", [["09:00", "10:00"], ["14:00", "15:00"]]);
    await prisma.timerNote.create({ data: { userId: user.id, timerId: timer.id, body: "A: acquisition due diligence", createdAt: at("09:30") } });
    expect((await api().put(`/time-entries/${entries[1].id}`).set(auth).send({ projectId: b.id })).status).toBe(200);
    expect((await api().delete(`/time-entries/${entries[0].id}`).set(auth)).status).toBe(200);
    const sheet = (await api().get(`/reports/timesheet?${RANGE}&format=json`).set(auth)).body.timesheet;
    expect(JSON.stringify(sheet)).not.toContain("due diligence");
  });

  it("an MCP timer with a session key counts as AI work tracked another way", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const timer = await prisma.timer.create({
      data: { userId: user.id, status: "stopped", agent: "claude_code", isAiGenerated: true, createdVia: "mcp", sessionKey: "claude-fix-pagination", startedAt: at("09:00"), stoppedAt: at("10:00") },
    });
    await prisma.timeEntry.create({
      data: { userId: user.id, timerId: timer.id, startTime: at("09:00"), endTime: at("10:00"), duration: 3600, isRunning: false, isAiGenerated: true },
    });
    const res = await api()
      .post("/agent-sessions/import")
      .set(key.auth)
      .send({ afterTrackedWork: true, sessions: [{ sessionKey: "transcript-1", spans: [["2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z"]] }] });
    expect(res.body.trackedUntil).toBe("2026-03-02T10:00:00.000Z");
    expect(res.body.sessions[0].status).toBe("skipped_tracked");
  });

  it("renaming through the running entry renames the timer's earlier segments too (one line)", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
    const started = await api().post("/timers").set(auth).send({ projectId: p.id, description: "tpyo" });
    const timerId = started.body.timer?.id ?? started.body.id;
    expect(timerId).toBeTruthy();
    // Give the first segment some length before pausing.
    await prisma.timeEntry.updateMany({ where: { timerId }, data: { startTime: new Date(Date.now() - 3600_000) } });
    await prisma.timer.update({ where: { id: timerId }, data: { startedAt: new Date(Date.now() - 3600_000) } });
    await api().post(`/timers/${timerId}/pause`).set(auth).send({});
    await api().post(`/timers/${timerId}/resume`).set(auth).send({});
    const running = await prisma.timeEntry.findFirstOrThrow({ where: { timerId, isRunning: true } });
    expect((await api().put(`/time-entries/${running.id}`).set(auth).send({ description: "Kickoff meeting" })).status).toBe(200);
    const segs = await prisma.timeEntry.findMany({ where: { timerId }, select: { description: true } });
    expect(segs.map((x) => x.description)).toEqual(["Kickoff meeting", "Kickoff meeting"]);
  });
});

describe("release review round 3", () => {
  const notesOf = async (auth: Record<string, string>, range = RANGE) =>
    (await api().get(`/reports/timesheet?${range}&format=json`).set(auth)).body.timesheet.projects.flatMap(
      (p: { lines: Array<{ notes: string[] }> }) => p.lines.flatMap((l) => l.notes)
    );

  it("trimming a segment's start past a note keeps the note (same client)", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
    const { timer, entries } = await agentTimer(user.id, p.id, "trim", [["09:00", "10:00"]]);
    await prisma.timerNote.create({ data: { userId: user.id, timerId: timer.id, body: "Set up the repo", createdAt: at("09:05") } });
    expect((await api().put(`/time-entries/${entries[0].id}`).set(auth).send({ startTime: at("09:10").toISOString() })).status).toBe(200);
    expect(await notesOf(auth)).toEqual(["Set up the repo"]);
  });

  it("a note added to a stopped timer in a later period shows with its last segment", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
    const { timer } = await agentTimer(user.id, p.id, "late note", [["09:00", "10:00"]]);
    await prisma.timerNote.create({ data: { userId: user.id, timerId: timer.id, body: "Shipped on Monday", createdAt: new Date("2026-03-09T09:00:00Z") } });
    expect(await notesOf(auth)).toEqual(["Shipped on Monday"]);
  });

  it("a timer started through the plugin's own MCP counts as tracked another way", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const mcp = (id: number, name: string, args: Record<string, unknown>) =>
      api()
        .post("/mcp")
        .set(key.auth)
        .set("X-Client", "claude_code")
        .set("Accept", "application/json, text/event-stream")
        .send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
    const started = await mcp(1, "start_timer", { sessionKey: "claude-fix-pagination", description: "pagination" });
    expect(started.body.result.isError).toBeFalsy();
    const timer = await prisma.timer.findFirstOrThrow({ where: { userId: user.id, sessionKey: "claude-fix-pagination" } });
    expect(timer.origin).toBe("claude_code");
    // An hour of work, then stopped.
    await prisma.timeEntry.updateMany({ where: { timerId: timer.id }, data: { startTime: new Date(Date.now() - 3600_000) } });
    await mcp(2, "stop_timer", { timerId: timer.id });
    expect(await prisma.timeEntry.count({ where: { timerId: timer.id, isAiGenerated: true } })).toBe(1);
    const res = await api()
      .post("/agent-sessions/import")
      .set(key.auth)
      .send({ afterTrackedWork: true, sessions: [{ sessionKey: "transcript-x", spans: [[new Date(Date.now() - 3600_000).toISOString(), new Date(Date.now() - 1800_000).toISOString()]] }] });
    expect(res.body.trackedUntil).not.toBeNull();
    expect(res.body.sessions[0].status).toBe("skipped_tracked");
  });

  it("an imported session resumed from the web, or another agent's hook session, is not 'other' tracking", async () => {
    const { user, auth } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const day = 86400_000;
    const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
    await api().post("/agent-sessions/import").set(key.auth).send({ sessions: [{ sessionKey: "sess-a", spans: [[iso(3 * day), iso(3 * day - 1800_000)]] }] });
    const imported = await prisma.timer.findFirstOrThrow({ where: { sessionKey: "sess-a" } });
    expect((await api().post(`/timers/${imported.id}/resume`).set(auth).send({})).status).toBe(200);
    await api().post(`/timers/${imported.id}/stop`).set(auth).send({});
    // A generic agent's hook session (not claude_code/cursor/codex).
    const hook = await api().post("/agent-events").set(key.auth).send({ event: "session_start", sessionKey: "gemini-1", agent: "gemini", cwd: "/tmp/g" });
    expect(hook.status).toBe(200);
    const res = await api()
      .post("/agent-sessions/import")
      .set(key.auth)
      .send({ afterTrackedWork: true, dryRun: true, sessions: [{ sessionKey: "sess-b", spans: [[iso(5 * day), iso(5 * day - 1800_000)]] }] });
    expect(res.body.trackedUntil).toBeNull();
    expect(res.body.sessions[0].status).toBe("imported");
  });

  it("a bulk rename that includes the running segment audits each segment once", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id, { name: "Acme", hourlyRate: 100 });
    const started = await api().post("/timers").set(auth).send({ projectId: p.id, description: "Old" });
    const timerId = started.body.timer?.id ?? started.body.id;
    const running = await prisma.timeEntry.findFirstOrThrow({ where: { timerId, isRunning: true } });
    // Earlier work backfilled onto the same timer after it started (so the
    // running segment comes first in the batch).
    const backfill = await api()
      .post("/time-entries")
      .set(auth)
      .send({ timerId, projectId: p.id, description: "Old", startTime: new Date(Date.now() - 7200_000).toISOString(), endTime: new Date(Date.now() - 5400_000).toISOString() });
    expect(backfill.status).toBe(201);
    const earlierId = backfill.body.timeEntry.id;
    const bulk = await api().post("/time-entries/bulk-update").set(auth).send({ ids: [running.id, earlierId], set: { description: "New" } });
    expect(bulk.status).toBe(200);
    const audits = await prisma.auditEvent.findMany({ where: { entityType: "time_entry", entityId: earlierId, action: "update" } });
    expect(audits).toHaveLength(1);
  });
});

