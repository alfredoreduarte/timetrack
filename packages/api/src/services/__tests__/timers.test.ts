import { prisma } from "../../utils/database";
import {
  addTimerNote,
  getTimerDetail,
  listTimers,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  sweepIdleTimers,
  touchTimer,
  updateTimer,
} from "../timers";
import { listAuditEvents } from "../audit";
import { MAX_RUNNING_ENTRIES } from "../limits";
import {
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

async function setup() {
  const { user } = await createUser({ defaultHourlyRate: 100 });
  const clock = testClock();
  const ctx = serviceCtx(user.id, { now: clock.now });
  return { user, clock, ctx };
}

const entriesOf = (timerId: string) =>
  prisma.timeEntry.findMany({ where: { timerId }, orderBy: { startTime: "asc" } });

describe("timer lifecycle", () => {
  it("starts a timer with one running segment and audits both", async () => {
    const { ctx } = await setup();
    const res = await startTimer(ctx, { description: "Refactor auth", agent: "claude_code" });

    expect(res.created).toBe(true);
    expect(res.timer).toMatchObject({
      status: "running",
      description: "Refactor auth",
      agent: "claude_code",
      createdVia: "mcp",
      isAiGenerated: true,
      segmentCount: 1,
    });
    expect(res.entry).toMatchObject({ isRunning: true, timerId: res.timer.id, isAiGenerated: true });

    const timerEvents = await listAuditEvents(ctx, "timer", res.timer.id);
    expect(timerEvents.map((e) => e.action)).toEqual(["start"]);
    expect(timerEvents[0]).toMatchObject({ actorType: "api_key", actorLabel: "Test agent", via: "mcp" });
  });

  it("pauses at a point in time, resumes into a new segment, and totals tracked time", async () => {
    const { ctx, clock } = await setup();
    const { timer } = await startTimer(ctx, {});

    clock.advance(30 * MIN);
    const paused = await pauseTimer(ctx, timer.id);
    expect(paused.changed).toBe(true);
    expect(paused.timer).toMatchObject({ status: "paused", pauseReason: "manual" });
    expect(paused.entry).toMatchObject({ isRunning: false, duration: 1800, stopReason: "paused" });

    expect((await pauseTimer(ctx, timer.id)).changed).toBe(false); // idempotent

    clock.advance(60 * MIN); // the gap is not billed
    const resumed = await resumeTimer(ctx, timer.id);
    expect(resumed.changed).toBe(true);
    expect(resumed.entry?.isRunning).toBe(true);
    expect((await resumeTimer(ctx, timer.id)).changed).toBe(false); // idempotent

    clock.advance(15 * MIN);
    const stopped = await stopTimer(ctx, timer.id);
    expect(stopped.timer).toMatchObject({ status: "stopped", segmentCount: 2, trackedSeconds: 2700 });
    expect((await stopTimer(ctx, timer.id)).changed).toBe(false);

    const segs = await entriesOf(timer.id);
    expect(segs.map((s) => s.duration)).toEqual([1800, 900]);
    expect(segs.every((s) => !s.isRunning)).toBe(true);
  });

  it("supports backdated pause and clamps it to the segment start", async () => {
    const { ctx, clock } = await setup();
    const { timer } = await startTimer(ctx, {});
    clock.advance(60 * MIN);
    const backdated = new Date(clock.now().getTime() - 20 * MIN).toISOString();
    const res = await pauseTimer(ctx, timer.id, { at: backdated });
    expect(res.entry?.duration).toBe(40 * 60);

    await resumeTimer(ctx, timer.id);
    clock.advance(5 * MIN);
    const beforeStart = new Date(clock.now().getTime() - 60 * MIN).toISOString();
    const clamped = await pauseTimer(ctx, timer.id, { at: beforeStart });
    // Clamped to the segment start → zero-length → discarded.
    expect(clamped.entry).toBeNull();
    expect(await entriesOf(timer.id)).toHaveLength(1);
  });

  it("rejects timestamps in the future but tolerates small clock skew", async () => {
    const { ctx, clock } = await setup();
    const { timer } = await startTimer(ctx, {});
    clock.advance(10 * MIN);
    const farFuture = new Date(clock.now().getTime() + 10 * MIN).toISOString();
    await expect(pauseTimer(ctx, timer.id, { at: farFuture })).rejects.toMatchObject({ statusCode: 400 });
    const skew = new Date(clock.now().getTime() + 2 * MIN).toISOString();
    const res = await pauseTimer(ctx, timer.id, { at: skew });
    expect(res.entry?.duration).toBe(600);
  });

  it("allows backdated starts up to 24h", async () => {
    const { ctx, clock } = await setup();
    const res = await startTimer(ctx, {
      startedAt: new Date(clock.now().getTime() - 45 * MIN).toISOString(),
    });
    expect(res.timer.trackedSeconds).toBe(45 * 60);
    await expect(
      startTimer(ctx, { startedAt: new Date(clock.now().getTime() - 25 * 60 * MIN).toISOString() })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("sessionKey idempotency", () => {
  it("returns the same running timer for repeated starts", async () => {
    const { ctx } = await setup();
    const a = await startTimer(ctx, { sessionKey: "sess-1" });
    const b = await startTimer(ctx, { sessionKey: "sess-1", description: "ignored" });
    expect(b.created).toBe(false);
    expect(b.changed).toBe(false);
    expect(b.timer.id).toBe(a.timer.id);
    expect(b.timer.description).toBeNull();
    expect(await entriesOf(a.timer.id)).toHaveLength(1);
  });

  it("is safe under concurrent starts with the same key", async () => {
    const { ctx } = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => startTimer(ctx, { sessionKey: "race" }))
    );
    const ids = new Set(results.map((r) => r.timer.id));
    expect(ids.size).toBe(1);
    expect(await prisma.timer.count()).toBe(1);
    expect(await prisma.timeEntry.count({ where: { isRunning: true } })).toBe(1);
  });

  it("resumes a paused or stopped timer and refreshes repo context", async () => {
    const { ctx, clock } = await setup();
    const { timer } = await startTimer(ctx, { sessionKey: "s", gitBranch: "main" });
    clock.advance(10 * MIN);
    await stopTimer(ctx, timer.id);
    clock.advance(10 * MIN);
    const again = await startTimer(ctx, { sessionKey: "s", gitBranch: "feature/x" });
    expect(again.created).toBe(false);
    expect(again.changed).toBe(true);
    expect(again.timer).toMatchObject({ id: timer.id, status: "running", gitBranch: "feature/x" });
    expect(await entriesOf(timer.id)).toHaveLength(2);
  });

  it("scopes session keys per user", async () => {
    const { ctx } = await setup();
    const other = await createUser();
    const a = await startTimer(ctx, { sessionKey: "shared" });
    const b = await startTimer(serviceCtx(other.user.id), { sessionKey: "shared" });
    expect(a.timer.id).not.toBe(b.timer.id);
  });
});

describe("heartbeats and idle auto-pause", () => {
  it("pauses at the last activity and resumes on the next heartbeat", async () => {
    const { ctx, clock } = await setup();
    const t0 = clock.now().getTime();
    const { timer } = await startTimer(ctx, { sessionKey: "s", idleTimeoutSeconds: 900 });

    clock.advance(5 * MIN);
    await touchTimer(ctx, timer.id);

    // 14 minutes of silence: not idle yet.
    expect(await sweepIdleTimers(new Date(t0 + 19 * MIN))).toBe(0);
    // 16 minutes of silence: idle.
    expect(await sweepIdleTimers(new Date(t0 + 21 * MIN))).toBe(1);

    const detail = await getTimerDetail(ctx, timer.id);
    expect(detail).toMatchObject({ status: "paused", pauseReason: "idle", trackedSeconds: 300 });
    expect(detail.segments[0]).toMatchObject({
      stopReason: "idle",
      endTime: new Date(t0 + 5 * MIN),
    });
    const audit = await listAuditEvents(ctx, "timer", timer.id);
    expect(audit.find((e) => e.action === "auto_pause")).toMatchObject({ actorType: "system" });

    clock.set(new Date(t0 + 40 * MIN).toISOString());
    const touched = await touchTimer(ctx, timer.id);
    expect(touched.resumed).toBe(true);
    expect(touched.timer.status).toBe("running");
    const segs = await entriesOf(timer.id);
    expect(segs).toHaveLength(2);
    expect(segs[1].startTime).toEqual(new Date(t0 + 40 * MIN));
  });

  it("never sweeps timers without an idle timeout", async () => {
    const { ctx, clock } = await setup();
    await startTimer(ctx, {});
    expect(await sweepIdleTimers(new Date(clock.now().getTime() + 48 * 60 * MIN))).toBe(0);
  });

  it("does not pause when activity arrived after the sweep looked", async () => {
    const { ctx, clock } = await setup();
    const { timer } = await startTimer(ctx, { idleTimeoutSeconds: 600 });
    const staleActivity = clock.now();
    clock.advance(20 * MIN);
    await touchTimer(ctx, timer.id);
    const res = await pauseTimer(ctx, timer.id, {
      reason: "idle",
      at: staleActivity,
      expectLastActivityAt: staleActivity,
    });
    expect(res.changed).toBe(false);
  });

  it("does not resume a manually paused or stopped timer on heartbeat", async () => {
    const { ctx, clock } = await setup();
    const { timer } = await startTimer(ctx, { idleTimeoutSeconds: 600 });
    clock.advance(MIN);
    await pauseTimer(ctx, timer.id);
    clock.advance(MIN);
    expect((await touchTimer(ctx, timer.id)).timer.status).toBe("paused");
    await stopTimer(ctx, timer.id);
    expect((await touchTimer(ctx, timer.id)).timer.status).toBe("stopped");
  });

  it("debounces rapid heartbeats", async () => {
    const { ctx, clock } = await setup();
    const { timer } = await startTimer(ctx, {});
    const first = clock.now();
    clock.advance(5_000);
    await touchTimer(ctx, timer.id);
    expect((await prisma.timer.findUniqueOrThrow({ where: { id: timer.id } })).lastActivityAt).toEqual(first);
    clock.advance(20_000);
    await touchTimer(ctx, timer.id);
    expect((await prisma.timer.findUniqueOrThrow({ where: { id: timer.id } })).lastActivityAt).toEqual(clock.now());
  });
});

describe("assignment, notes and limits", () => {
  it("reassigns all segments to a new project and recomputes their rate", async () => {
    const { user, ctx, clock } = await setup();
    const acme = await createProject(user.id, { name: "Acme", hourlyRate: 150 });
    const { timer } = await startTimer(ctx, { description: "Agent session" });
    clock.advance(10 * MIN);
    await pauseTimer(ctx, timer.id);
    await prisma.timeEntry.updateMany({ where: { timerId: timer.id }, data: { description: "hand-edited" } });
    clock.advance(MIN);
    await resumeTimer(ctx, timer.id);
    clock.advance(10 * MIN);

    const res = await updateTimer(ctx, timer.id, { projectId: acme.id, description: "Acme API work" });
    expect(res.changed).toBe(true);
    expect(res.entriesUpdated).toBe(2);
    const segs = await entriesOf(timer.id);
    expect(segs.every((s) => s.projectId === acme.id && s.hourlyRateSnapshot === 150)).toBe(true);
    // Only the segment that still carried the old description is renamed.
    expect(segs.map((s) => s.description)).toEqual(["hand-edited", "Acme API work"]);
  });

  it("derives the project from a task and rejects mismatches", async () => {
    const { user, ctx } = await setup();
    const p1 = await createProject(user.id);
    const p2 = await createProject(user.id);
    const task = await createTask(user.id, p1.id, { hourlyRate: 200 });

    const res = await startTimer(ctx, { taskId: task.id });
    expect(res.timer.projectId).toBe(p1.id);
    expect(res.entry?.hourlyRateSnapshot).toBe(200);
    await expect(startTimer(ctx, { projectId: p2.id, taskId: task.id })).rejects.toMatchObject({
      statusCode: 400,
    });

    // Moving to another project drops the task that doesn't belong there.
    const moved = await updateTimer(ctx, res.timer.id, { projectId: p2.id });
    expect(moved.timer).toMatchObject({ projectId: p2.id, taskId: null });
  });

  it("isolates timers between users", async () => {
    const { ctx } = await setup();
    const other = await createUser();
    const { timer } = await startTimer(ctx, {});
    const otherCtx = serviceCtx(other.user.id);
    await expect(pauseTimer(otherCtx, timer.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(updateTimer(otherCtx, timer.id, { description: "x" })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(addTimerNote(otherCtx, timer.id, "x")).rejects.toMatchObject({ statusCode: 404 });
    expect(await listTimers(otherCtx)).toHaveLength(0);
  });

  it("stores sanitized notes and rejects empty ones", async () => {
    const { ctx } = await setup();
    const { timer } = await startTimer(ctx, {});
    const note = await addTimerNote(ctx, timer.id, "Fixed <script>alert(1)</script>login bug");
    expect(note.body).not.toMatch(/<script>/);
    expect(note.body).toContain("login bug");
    await expect(addTimerNote(ctx, timer.id, "   ")).rejects.toMatchObject({ statusCode: 400 });
    expect((await getTimerDetail(ctx, timer.id)).notes).toHaveLength(1);
  });

  it("caps concurrently running timers", async () => {
    const { ctx } = await setup();
    for (let i = 0; i < MAX_RUNNING_ENTRIES; i++) await startTimer(ctx, {});
    await expect(startTimer(ctx, {})).rejects.toMatchObject({ statusCode: 429 });
  });

  it("lists active timers by default", async () => {
    const { ctx, clock } = await setup();
    const a = await startTimer(ctx, {});
    const b = await startTimer(ctx, {});
    const c = await startTimer(ctx, {});
    clock.advance(MIN);
    await pauseTimer(ctx, b.timer.id);
    await stopTimer(ctx, c.timer.id);
    const active = await listTimers(ctx);
    expect(active.map((t) => t.id).sort()).toEqual([a.timer.id, b.timer.id].sort());
    expect(await listTimers(ctx, { status: "stopped" })).toHaveLength(1);
    expect(await listTimers(ctx, { status: "all" })).toHaveLength(3);
  });
});
