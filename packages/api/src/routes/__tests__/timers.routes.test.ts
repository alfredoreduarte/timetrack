import { prisma } from "../../utils/database";
import {
  api,
  resetDb,
  createUser,
  createApiKey,
  createProject,
  createTask,
  disconnect,
} from "../../test/helpers";

beforeEach(resetDb);
afterAll(disconnect);

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe("/timers REST", () => {
  it("starts idempotently by sessionKey (201 then 200)", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const body = { sessionKey: "cc-session-1", agent: "claude_code", description: "Session" };

    const first = await api().post("/timers").set(key.auth).set("X-Client", "claude_code").send(body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, changed: true });
    expect(first.body.timer).toMatchObject({
      status: "running",
      createdVia: "claude_code",
      isAiGenerated: true,
      sessionKey: "cc-session-1",
    });

    const second = await api().post("/timers").set(key.auth).send(body);
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.timer.id).toBe(first.body.timer.id);
  });

  it("rejects unknown fields so agents learn about typos", async () => {
    const { auth } = await createUser();
    const res = await api().post("/timers").set(auth).send({ descripton: "typo" });
    expect(res.status).toBe(400);
  });

  it("pauses, resumes, stops, lists and shows detail with segments and notes", async () => {
    const { auth } = await createUser();
    const started = await api().post("/timers").set(auth).send({ startedAt: ago(30) });
    const id = started.body.timer.id;

    const paused = await api().post(`/timers/${id}/pause`).set(auth).send({ at: ago(10) });
    expect(paused.status).toBe(200);
    expect(paused.body.entry.duration).toBeGreaterThanOrEqual(1199);

    expect((await api().get("/timers?status=paused").set(auth)).body.timers).toHaveLength(1);
    // Backdated resume before the pause end is clamped (no double billing).
    const resumed = await api().post(`/timers/${id}/resume`).set(auth).send({ at: ago(20) });
    expect(resumed.body.timer.status).toBe("running");
    expect(new Date(resumed.body.entry.startTime).getTime()).toBe(
      new Date(paused.body.entry.endTime).getTime()
    );
    expect((await api().post(`/timers/${id}/notes`).set(auth).send({ body: "Wrote migration" })).status).toBe(201);
    expect((await api().post(`/timers/${id}/heartbeat`).set(auth).send({})).status).toBe(200);
    expect((await api().post(`/timers/${id}/stop`).set(auth).send({})).body.timer.status).toBe("stopped");

    const detail = await api().get(`/timers/${id}`).set(auth);
    expect(detail.body.timer.segments).toHaveLength(2);
    expect(detail.body.timer.notes.map((n: { body: string }) => n.body)).toEqual(["Wrote migration"]);

    const history = await api().get(`/timers/${id}/history`).set(auth);
    expect(history.body.events.map((e: { action: string }) => e.action)).toEqual([
      "start",
      "pause",
      "resume",
      "stop",
    ]);
  });

  it("PATCH reassigns a timer and its segments", async () => {
    const { user, auth } = await createUser();
    const project = await createProject(user.id, { hourlyRate: 90 });
    const started = await api().post("/timers").set(auth).send({});
    const res = await api().patch(`/timers/${started.body.timer.id}`).set(auth).send({ projectId: project.id });
    expect(res.status).toBe(200);
    expect(res.body.timer.project).toMatchObject({ id: project.id });
    expect(res.body.timer.currentEntry).toMatchObject({ projectId: project.id, hourlyRateSnapshot: 90 });
  });

  it("404s on other users' timers", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const started = await api().post("/timers").set(alice.auth).send({});
    const id = started.body.timer.id;
    for (const path of ["pause", "resume", "stop", "heartbeat"]) {
      expect((await api().post(`/timers/${id}/${path}`).set(bob.auth).send({})).status).toBe(404);
    }
    expect((await api().get(`/timers/${id}`).set(bob.auth)).status).toBe(404);
    expect((await api().get(`/timers/${id}/history`).set(bob.auth)).status).toBe(404);
    expect((await api().patch(`/timers/${id}`).set(bob.auth).send({ description: "x" })).status).toBe(404);
  });
});

describe("legacy endpoints on top of timers", () => {
  it("legacy start creates a timer and legacy stop stops it", async () => {
    const { auth } = await createUser();
    const started = await api().post("/time-entries/start").set(auth).send({ description: "Legacy" });
    const entry = started.body.timeEntry;
    expect(entry.timerId).toBeTruthy();

    await api().post(`/time-entries/${entry.id}/stop`).set(auth).send({});
    const timer = await api().get(`/timers/${entry.timerId}`).set(auth);
    expect(timer.body.timer.status).toBe("stopped");
  });

  it("a paused timer disappears from /running and /current (what native apps poll)", async () => {
    const { auth } = await createUser();
    const started = await api().post("/timers").set(auth).send({ startedAt: ago(5) });
    await api().post(`/timers/${started.body.timer.id}/pause`).set(auth).send({});
    expect((await api().get("/time-entries/running").set(auth)).body.timeEntries).toHaveLength(0);
    expect((await api().get("/time-entries/current").set(auth)).body.timeEntry).toBeNull();
  });

  it("stopping a pre-timer running entry still works", async () => {
    const { user, auth } = await createUser();
    const legacy = await prisma.timeEntry.create({
      data: { userId: user.id, startTime: new Date(Date.now() - 60_000), isRunning: true },
    });
    const res = await api().post(`/time-entries/${legacy.id}/stop`).set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.timeEntry).toMatchObject({ isRunning: false, timerId: null });
    expect(res.body.timeEntry.duration).toBeGreaterThanOrEqual(59);
  });

  it("rejects a legacy stop whose endTime is before the start", async () => {
    const { auth } = await createUser();
    const started = await api().post("/time-entries/start").set(auth).send({});
    const res = await api()
      .post(`/time-entries/${started.body.timeEntry.id}/stop`)
      .set(auth)
      .send({ endTime: ago(60) });
    expect(res.status).toBe(400);
  });
});

describe("editing entries (incl. running ones)", () => {
  it("edits a running entry and mirrors the change onto its timer", async () => {
    const { user, auth } = await createUser();
    const project = await createProject(user.id, { hourlyRate: 120 });
    const started = await api().post("/time-entries/start").set(auth).send({});
    const id = started.body.timeEntry.id;

    const res = await api()
      .put(`/time-entries/${id}`)
      .set(auth)
      .send({ description: "Now I know what this is", projectId: project.id, startTime: ago(15) });
    expect(res.status).toBe(200);
    expect(res.body.timeEntry).toMatchObject({
      isRunning: true,
      description: "Now I know what this is",
      projectId: project.id,
      hourlyRateSnapshot: 120,
    });

    const timer = await api().get(`/timers/${started.body.timeEntry.timerId}`).set(auth);
    expect(timer.body.timer).toMatchObject({ description: "Now I know what this is", projectId: project.id });
  });

  it("refuses to set the end of a running entry", async () => {
    const { auth } = await createUser();
    const started = await api().post("/time-entries/start").set(auth).send({});
    const res = await api().put(`/time-entries/${started.body.timeEntry.id}`).set(auth).send({ hours: 1 });
    expect(res.status).toBe(400);
  });

  it("reclassifies AI work and records who did it", async () => {
    const { user, auth } = await createUser();
    const key = await createApiKey(user.id, { name: "Cursor" });
    const created = await api()
      .post("/time-entries")
      .set(key.auth)
      .set("X-Client", "cursor")
      .send({ startTime: ago(120), endTime: ago(60), description: "agent work" });
    expect(created.body.timeEntry.isAiGenerated).toBe(true);
    const id = created.body.timeEntry.id;

    await api().put(`/time-entries/${id}`).set(auth).send({ isAiGenerated: false });
    const history = await api().get(`/time-entries/${id}/history`).set(auth);
    expect(history.body.events).toHaveLength(2);
    expect(history.body.events[0]).toMatchObject({ action: "create", actorLabel: "Cursor", via: "cursor" });
    expect(history.body.events[1]).toMatchObject({
      action: "update",
      actorType: "user",
      changes: { isAiGenerated: { from: true, to: false } },
    });
  });

  it("rejects future, inverted and >24h manual entries", async () => {
    const { auth } = await createUser();
    const future = new Date(Date.now() + 3 * 3600_000).toISOString();
    expect((await api().post("/time-entries").set(auth).send({ startTime: ago(10), endTime: future })).status).toBe(400);
    expect((await api().post("/time-entries").set(auth).send({ startTime: ago(10), endTime: ago(20) })).status).toBe(400);
    expect((await api().post("/time-entries").set(auth).send({ startTime: ago(26 * 60), endTime: ago(60) })).status).toBe(400);
  });

  it("backfills a segment into an existing timer, inheriting its project", async () => {
    const { user, auth } = await createUser();
    const project = await createProject(user.id);
    const started = await api().post("/timers").set(auth).send({ projectId: project.id });
    const res = await api()
      .post("/time-entries")
      .set(auth)
      .send({ startTime: ago(90), endTime: ago(80), timerId: started.body.timer.id });
    expect(res.status).toBe(201);
    expect(res.body.timeEntry).toMatchObject({ timerId: started.body.timer.id, projectId: project.id });
  });

  it("refuses edits and backfills that overlap another segment of the same timer", async () => {
    const { auth } = await createUser();
    const started = await api().post("/timers").set(auth).send({ startedAt: ago(60) });
    const timerId = started.body.timer.id;
    await api().post(`/timers/${timerId}/pause`).set(auth).send({ at: ago(40) }); // seg1: -60..-40
    await api().post(`/timers/${timerId}/resume`).set(auth).send({ at: ago(30) }); // seg2: -30..now

    const overlapBackfill = await api()
      .post("/time-entries")
      .set(auth)
      .send({ startTime: ago(45), endTime: ago(35), timerId });
    expect(overlapBackfill.status).toBe(400);

    const gapBackfill = await api()
      .post("/time-entries")
      .set(auth)
      .send({ startTime: ago(39), endTime: ago(31), timerId });
    expect(gapBackfill.status).toBe(201);

    const running = started.body.timer.id && (await api().get(`/timers/${timerId}`).set(auth)).body.timer.currentEntry;
    const overlapEdit = await api().put(`/time-entries/${running.id}`).set(auth).send({ startTime: ago(50) });
    expect(overlapEdit.status).toBe(400);
  });

  it("deleting a timer's running segment pauses the timer", async () => {
    const { auth } = await createUser();
    const started = await api().post("/timers").set(auth).send({});
    const entryId = started.body.entry.id;
    expect((await api().delete(`/time-entries/${entryId}`).set(auth)).status).toBe(200);
    const timer = await api().get(`/timers/${started.body.timer.id}`).set(auth);
    expect(timer.body.timer).toMatchObject({ status: "paused", segmentCount: 0 });
    // History survives the deletion.
    const history = await api().get(`/time-entries/${entryId}/history`).set(auth);
    expect(history.body.events.map((e: { action: string }) => e.action)).toEqual(["start", "delete"]);
  });

  it("GET /time-entries/:id returns the entry and 404s across users", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const started = await api().post("/time-entries/start").set(alice.auth).send({});
    const id = started.body.timeEntry.id;
    expect((await api().get(`/time-entries/${id}`).set(alice.auth)).body.timeEntry.id).toBe(id);
    expect((await api().get(`/time-entries/${id}`).set(bob.auth)).status).toBe(404);
    expect((await api().get(`/time-entries/${id}/history`).set(bob.auth)).status).toBe(404);
  });

  it("filters the list by timer and AI flag", async () => {
    const { user, auth } = await createUser();
    const key = await createApiKey(user.id);
    const t = await api().post("/timers").set(key.auth).send({});
    await api().post("/time-entries").set(auth).send({ startTime: ago(100), endTime: ago(90) });
    const byTimer = await api().get(`/time-entries?timerId=${t.body.timer.id}`).set(auth);
    expect(byTimer.body.entries).toHaveLength(1);
    const human = await api().get("/time-entries?isAiGenerated=false").set(auth);
    expect(human.body.entries).toHaveLength(1);
    expect(human.body.entries[0].isAiGenerated).toBe(false);
  });
});

describe("bulk update", () => {
  it("moves many entries to a project atomically", async () => {
    const { user, auth } = await createUser();
    const project = await createProject(user.id, { hourlyRate: 60 });
    const task = await createTask(user.id, project.id);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await api()
        .post("/time-entries")
        .set(auth)
        .send({ startTime: ago(200 - i * 30), endTime: ago(190 - i * 30) });
      ids.push(r.body.timeEntry.id);
    }
    const res = await api()
      .post("/time-entries/bulk-update")
      .set(auth)
      .send({ ids, set: { projectId: project.id, taskId: task.id } });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);
    const rows = await prisma.timeEntry.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.projectId === project.id && r.taskId === task.id && r.hourlyRateSnapshot === 60)).toBe(true);
  });

  it("fails entirely if any id is not the caller's", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const mine = await api().post("/time-entries").set(alice.auth).send({ startTime: ago(20), endTime: ago(10) });
    const theirs = await api().post("/time-entries").set(bob.auth).send({ startTime: ago(20), endTime: ago(10) });
    const res = await api()
      .post("/time-entries/bulk-update")
      .set(alice.auth)
      .send({ ids: [mine.body.timeEntry.id, theirs.body.timeEntry.id], set: { description: "x" } });
    expect(res.status).toBe(404);
    const untouched = await prisma.timeEntry.findUniqueOrThrow({ where: { id: mine.body.timeEntry.id } });
    expect(untouched.description).toBeNull();
  });
});
