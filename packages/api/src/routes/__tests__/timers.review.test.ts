// Regression tests for the S1 adversarial review findings (PR #163).
import { prisma } from "../../utils/database";
import * as realtime from "../../realtime";
import { startTimer, pauseTimer, sweepIdleTimers, touchTimer, updateTimer } from "../../services/timers";
import { MAX_RUNNING_ENTRIES } from "../../services/limits";
import {
  api,
  resetDb,
  createUser,
  createProject,
  createTask,
  disconnect,
  serviceCtx,
  testClock,
  MIN,
} from "../../test/helpers";

beforeEach(resetDb);
afterAll(disconnect);

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function invariants(userId: string) {
  const timers = await prisma.timer.findMany({ where: { userId }, include: { entries: true } });
  for (const t of timers) {
    const running = t.entries.filter((e) => e.isRunning);
    expect(running.length).toBe(t.status === "running" ? 1 : 0);
    for (const e of t.entries) {
      if (!e.isRunning) {
        expect(e.endTime).not.toBeNull();
        expect(e.duration).not.toBeNull();
      }
    }
  }
}

describe("S1 review fixes", () => {
  it("concurrent edits and stops never corrupt a segment or leave two running", async () => {
    const { user, auth } = await createUser();
    for (let trial = 0; trial < 12; trial++) {
      const t = await api().post("/timers").set(auth).send({ startedAt: ago(30) });
      const entryId = t.body.entry.id;
      await Promise.all([
        api().put(`/time-entries/${entryId}`).set(auth).send({ description: `edit ${trial}` }),
        api().post(`/timers/${t.body.timer.id}/stop`).set(auth).send({}),
      ]);
      const t2 = await api().post("/timers").set(auth).send({ startedAt: ago(30) });
      await Promise.all([
        api().delete(`/time-entries/${t2.body.entry.id}`).set(auth),
        api().post(`/timers/${t2.body.timer.id}/pause`).set(auth).send({}),
        api().post(`/timers/${t2.body.timer.id}/resume`).set(auth).send({}),
      ]);
    }
    await invariants(user.id);
  });

  it("enabling idle detection on a long-running timer keeps its tracked time", async () => {
    const { user } = await createUser();
    const clock = testClock();
    const ctx = serviceCtx(user.id, { now: clock.now });
    const { timer } = await startTimer(ctx, {});
    clock.advance(180 * MIN);
    await updateTimer(ctx, timer.id, { idleTimeoutSeconds: 900 });
    expect(await sweepIdleTimers(new Date(clock.now().getTime() + 5 * MIN))).toBe(0);
    const swept = await sweepIdleTimers(new Date(clock.now().getTime() + 20 * MIN));
    expect(swept).toBe(1);
    const entries = await prisma.timeEntry.findMany({ where: { timerId: timer.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].duration).toBe(180 * 60); // ends at the moment idle tracking was enabled
  });

  it("bounds moving a running entry's start to 24h", async () => {
    const { auth } = await createUser();
    const t = await api().post("/timers").set(auth).send({});
    const id = t.body.entry.id;
    expect((await api().put(`/time-entries/${id}`).set(auth).send({ startTime: "2016-01-01T00:00:00Z" })).status).toBe(400);
    expect((await api().put(`/time-entries/${id}`).set(auth).send({ startTime: ago(120) })).status).toBe(200);
  });

  it("bounds backdated resumes and floors them at the timer start", async () => {
    const { user } = await createUser();
    const clock = testClock();
    const ctx = serviceCtx(user.id, { now: clock.now });
    const { timer } = await startTimer(ctx, {});
    await pauseTimer(ctx, timer.id); // zero-length segment discarded
    const { resumeTimer } = await import("../../services/timers");
    await expect(resumeTimer(ctx, timer.id, { at: "2001-01-01T00:00:00Z" })).rejects.toMatchObject({ statusCode: 400 });
    clock.advance(10 * MIN);
    const r = await resumeTimer(ctx, timer.id, { at: new Date(clock.now().getTime() - 60 * MIN) });
    // Floored at the timer's start, not 60 minutes back.
    expect(r.entry!.startTime.getTime()).toBe(timer.startedAt.getTime());
  });

  it("a stop racing a heartbeat on an idle-paused timer always wins", async () => {
    const { user, auth } = await createUser();
    for (let trial = 0; trial < 10; trial++) {
      const t = await api().post("/timers").set(auth).send({ idleTimeoutSeconds: 60, startedAt: ago(10) });
      await prisma.timer.update({ where: { id: t.body.timer.id }, data: { lastActivityAt: new Date(Date.now() - 5 * 60_000) } });
      await sweepIdleTimers(new Date());
      await Promise.all([
        api().post(`/timers/${t.body.timer.id}/heartbeat`).set(auth).send({}),
        api().post(`/timers/${t.body.timer.id}/stop`).set(auth).send({}),
      ]);
      const final = await prisma.timer.findUniqueOrThrow({ where: { id: t.body.timer.id } });
      expect(final.status).toBe("stopped");
    }
    await invariants(user.id);
  });

  it("a manual pause of an idle-paused timer sticks", async () => {
    const { user } = await createUser();
    const clock = testClock();
    const ctx = serviceCtx(user.id, { now: clock.now });
    const { timer } = await startTimer(ctx, { idleTimeoutSeconds: 60 });
    clock.advance(10 * MIN);
    await sweepIdleTimers(clock.now());
    const r = await pauseTimer(ctx, timer.id);
    expect(r.timer.pauseReason).toBe("manual");
    clock.advance(MIN);
    expect((await touchTimer(ctx, timer.id)).resumed).toBe(false);
  });

  it("accepts the web modal resending unchanged times on long entries and adjacent segments", async () => {
    const { user, auth } = await createUser();
    // A 30h entry produced by a forgotten timer.
    const long = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        startTime: new Date(Date.now() - 40 * 3600_000),
        endTime: new Date(Date.now() - 10 * 3600_000),
        duration: 30 * 3600,
        isRunning: false,
      },
    });
    const res = await api()
      .put(`/time-entries/${long.id}`)
      .set(auth)
      .send({ description: "Forgot to stop", startTime: long.startTime.toISOString(), endTime: long.endTime!.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.timeEntry.duration).toBe(30 * 3600);
    // Growing it is still refused.
    const grow = await api()
      .put(`/time-entries/${long.id}`)
      .set(auth)
      .send({ startTime: new Date(long.startTime.getTime() - 3600_000).toISOString() });
    expect(grow.status).toBe(400);

    // Segment resumed right where the previous ended; resend unchanged times.
    const t = await api().post("/timers").set(auth).send({ startedAt: ago(30) });
    await api().post(`/timers/${t.body.timer.id}/pause`).set(auth).send({ at: ago(20) });
    const resumed = await api().post(`/timers/${t.body.timer.id}/resume`).set(auth).send({ at: ago(20) });
    const seg = resumed.body.entry;
    expect((await api().put(`/time-entries/${seg.id}`).set(auth).send({ description: "x", startTime: seg.startTime })).status).toBe(200);
  });

  it("keeps long descriptions editable and truncates on legacy start", async () => {
    const { user, auth } = await createUser();
    const longText = "a".repeat(1500);
    const e = await prisma.timeEntry.create({
      data: { userId: user.id, startTime: new Date(Date.now() - 7200_000), endTime: new Date(Date.now() - 3600_000), duration: 3600, isRunning: false, description: "b".repeat(2500) },
    });
    expect((await api().put(`/time-entries/${e.id}`).set(auth).send({ description: e.description, hours: 1 })).status).toBe(200);
    expect((await api().put(`/time-entries/${e.id}`).set(auth).send({ description: longText })).status).toBe(200);
    const started = await api().post("/time-entries/start").set(auth).send({ description: "c".repeat(3000) });
    expect(started.status).toBe(201);
    expect(started.body.timeEntry.description).toHaveLength(2000);
  });

  it("backfilling into a timer with an explicit project doesn't inherit its task", async () => {
    const { user, auth } = await createUser();
    const p1 = await createProject(user.id);
    const p2 = await createProject(user.id);
    const task = await createTask(user.id, p1.id);
    const t = await api().post("/timers").set(auth).send({ taskId: task.id });
    const res = await api()
      .post("/time-entries")
      .set(auth)
      .send({ startTime: ago(300), endTime: ago(290), timerId: t.body.timer.id, projectId: p2.id });
    expect(res.status).toBe(201);
    expect(res.body.timeEntry).toMatchObject({ projectId: p2.id, taskId: null });
  });

  it("enforces the running cap under a concurrent burst", async () => {
    const { user, auth } = await createUser();
    const results = await Promise.all(
      Array.from({ length: 40 }, () => api().post("/timers").set(auth).send({}))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(MAX_RUNNING_ENTRIES);
    expect(await prisma.timeEntry.count({ where: { userId: user.id, isRunning: true } })).toBe(MAX_RUNNING_ENTRIES);
  });
});

describe("S1 review round 2 fixes", () => {
  it("changing an existing idle timeout keeps the real last heartbeat", async () => {
    const { user } = await createUser();
    const clock = testClock();
    const ctx = serviceCtx(user.id, { now: clock.now });
    const { timer } = await startTimer(ctx, { idleTimeoutSeconds: 3600 });
    clock.advance(5 * MIN);
    await touchTimer(ctx, timer.id);
    const lastBeat = clock.now();
    clock.advance(40 * MIN);
    await updateTimer(ctx, timer.id, { idleTimeoutSeconds: 600 });
    expect(await sweepIdleTimers(clock.now())).toBe(1);
    const seg = await prisma.timeEntry.findFirstOrThrow({ where: { timerId: timer.id } });
    // Cut at the last real heartbeat (5 min in), not at the PATCH (45 min in).
    expect(seg.endTime).toEqual(lastBeat);
    expect(seg.duration).toBe(5 * 60);
  });

  it("deleting a project removes only its own entries and pauses its running timers", async () => {
    const { user, auth } = await createUser();
    const doomed = await createProject(user.id, { name: "Doomed" });
    const kept = await createProject(user.id, { name: "Kept" });
    const onDoomed = await api().post("/timers").set(auth).send({ projectId: doomed.id, startedAt: ago(30) });
    const unassigned = await api().post("/timers").set(auth).send({ startedAt: ago(30) });
    const manual = await api().post("/time-entries").set(auth).send({ startTime: ago(300), endTime: ago(240) });
    const keptEntry = await api().post("/time-entries").set(auth).send({ startTime: ago(200), endTime: ago(150), projectId: kept.id });

    expect((await api().delete(`/projects/${doomed.id}`).set(auth)).status).toBe(200);

    // Unrelated unassigned work survives (it used to be wiped).
    expect(await prisma.timeEntry.findUnique({ where: { id: manual.body.timeEntry.id } })).not.toBeNull();
    expect(await prisma.timeEntry.findUnique({ where: { id: keptEntry.body.timeEntry.id } })).not.toBeNull();
    const stillRunning = await prisma.timer.findUniqueOrThrow({ where: { id: unassigned.body.timer.id } });
    expect(stillRunning.status).toBe("running");
    const paused = await prisma.timer.findUniqueOrThrow({ where: { id: onDoomed.body.timer.id } });
    expect(paused).toMatchObject({ status: "paused", projectId: null });
    await invariants(user.id);
  });

  it("project/task deletes don't deadlock with concurrent pauses", async () => {
    const { user, auth } = await createUser();
    for (let i = 0; i < 8; i++) {
      const p = await createProject(user.id, { name: `P${i}` });
      const task = await createTask(user.id, p.id);
      const t = await api().post("/timers").set(auth).send({ projectId: p.id, taskId: task.id, startedAt: ago(20) });
      const [pause, delTask] = await Promise.all([
        api().post(`/timers/${t.body.timer.id}/pause`).set(auth).send({}),
        api().delete(`/tasks/${task.id}`).set(auth),
      ]);
      expect([pause.status, delTask.status]).toEqual([200, 200]);
      await api().post(`/timers/${t.body.timer.id}/resume`).set(auth).send({});
      const [pause2, delProject] = await Promise.all([
        api().post(`/timers/${t.body.timer.id}/pause`).set(auth).send({}),
        api().delete(`/projects/${p.id}`).set(auth),
      ]);
      expect([pause2.status, delProject.status]).toEqual([200, 200]);
    }
    await invariants(user.id);
  });

  it("a backfill racing a reassignment lands on the timer's final project", async () => {
    const { user, auth } = await createUser();
    for (let i = 0; i < 6; i++) {
      const p1 = await createProject(user.id, { hourlyRate: 50 });
      const p2 = await createProject(user.id, { hourlyRate: 90 });
      const t = await api().post("/timers").set(auth).send({ projectId: p1.id, startedAt: ago(10) });
      await Promise.all([
        api().patch(`/timers/${t.body.timer.id}`).set(auth).send({ projectId: p2.id }),
        api().post("/time-entries").set(auth).send({ startTime: ago(300), endTime: ago(290), timerId: t.body.timer.id }),
      ]);
      const timer = await prisma.timer.findUniqueOrThrow({ where: { id: t.body.timer.id }, include: { entries: true } });
      expect(timer.entries.every((e) => e.projectId === timer.projectId)).toBe(true);
    }
  });

  it("truncation never splits an emoji", async () => {
    const { auth } = await createUser();
    const res = await api().post("/time-entries/start").set(auth).send({ description: "a".repeat(1999) + "\u{1F600}tail" });
    expect(res.status).toBe(201);
    expect(res.body.timeEntry.description).toBe("a".repeat(1999));
  });
});

describe("S1 review round 3 fixes", () => {
  it("a timer moved onto a project while it's being deleted pauses with it", async () => {
    const { user, auth } = await createUser();
    const doomed = await createProject(user.id, { name: "Doomed" });
    const other = await createProject(user.id, { name: "Other" });
    const t = await api().post("/timers").set(auth).send({ projectId: other.id, startedAt: ago(30) });
    const timerId: string = t.body.timer.id;

    // Hold a reassignment open (timer lock taken, rows moved, not committed)
    // while the delete starts, then let it commit mid-delete.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let moved!: () => void;
    const movedP = new Promise<void>((r) => (moved = r));
    const mover = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM timers WHERE id = ${timerId} FOR UPDATE`;
        await tx.timer.update({ where: { id: timerId }, data: { projectId: doomed.id } });
        await tx.timeEntry.updateMany({ where: { timerId }, data: { projectId: doomed.id } });
        moved();
        await gate;
      },
      { timeout: 15_000 }
    );
    await movedP;
    const del = api().delete(`/projects/${doomed.id}`).set(auth).then((r) => r);
    await new Promise((r) => setTimeout(r, 300));
    release();
    await mover;
    expect((await del).status).toBe(200);

    const timer = await prisma.timer.findUniqueOrThrow({ where: { id: timerId }, include: { entries: true } });
    expect(timer).toMatchObject({ status: "paused", projectId: null });
    expect(timer.entries).toHaveLength(0);
    await invariants(user.id);
  });

  it("deleting a project and one of its tasks at once never deadlocks", async () => {
    const { user, auth } = await createUser();
    for (let i = 0; i < 15; i++) {
      const p = await createProject(user.id);
      const task = await createTask(user.id, p.id);
      for (let j = 0; j < 3; j++) {
        const r = await api()
          .post("/time-entries")
          .set(auth)
          .send({ startTime: ago(300 - j * 20), endTime: ago(290 - j * 20), projectId: p.id, taskId: task.id });
        expect(r.status).toBe(201);
      }
      const [delProject, delTask] = await Promise.all([
        api().delete(`/projects/${p.id}`).set(auth),
        api().delete(`/tasks/${task.id}`).set(auth),
      ]);
      expect(delProject.status).toBe(200);
      expect([200, 404]).toContain(delTask.status);
      expect(await prisma.timeEntry.count({ where: { userId: user.id } })).toBe(0);
    }
  });

  it("two deletes of the same project: one succeeds, the other is a 404", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id);
    await api().post("/timers").set(auth).send({ projectId: p.id, startedAt: ago(5) });
    const statuses = (
      await Promise.all([api().delete(`/projects/${p.id}`).set(auth), api().delete(`/projects/${p.id}`).set(auth)])
    )
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([200, 404]);
    await invariants(user.id);
  });

  it("deletes push the full timer to clients", async () => {
    const { user, auth } = await createUser();
    const p = await createProject(user.id);
    const task = await createTask(user.id, p.id);
    const onTask = await api().post("/timers").set(auth).send({ projectId: p.id, taskId: task.id, startedAt: ago(5) });
    const spy = jest.spyOn(realtime, "emitToUser");
    try {
      expect((await api().delete(`/tasks/${task.id}`).set(auth)).status).toBe(200);
      const updated = spy.mock.calls.find(([, event]) => event === "timer-updated");
      expect(updated?.[2]).toMatchObject({ id: onTask.body.timer.id, taskId: null, status: "running" });

      spy.mockClear();
      expect((await api().delete(`/projects/${p.id}`).set(auth)).status).toBe(200);
      const paused = spy.mock.calls.find(([, event]) => event === "timer-paused");
      expect(paused?.[2]).toMatchObject({
        id: onTask.body.timer.id,
        status: "paused",
        projectId: null,
        currentEntry: null,
        trackedSeconds: expect.any(Number),
      });
    } finally {
      spy.mockRestore();
    }
  });
});
