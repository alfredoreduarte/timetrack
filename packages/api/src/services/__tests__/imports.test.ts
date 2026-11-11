import { prisma } from "../../utils/database";
import { segmentSpans, Span } from "../imports";
import { api, resetDb, createUser, createProject, disconnect } from "../../test/helpers";

const t = (min: number) => new Date(Date.UTC(2026, 2, 2, 9, 0, 0) + min * 60_000);
const iso = (min: number) => t(min).toISOString();

describe("segmentSpans", () => {
  it("merges spans separated by less than the gap and drops empty segments", () => {
    const spans: Span[] = [
      [t(0), t(1)],
      [t(3), t(5)], // 2 min gap -> same segment
      [t(40), t(40)], // isolated point -> zero length -> dropped
      [t(70), t(71)],
      [t(72), t(80)],
    ];
    const segs = segmentSpans(spans, 600);
    expect(segs.map(([a, b]) => [a.toISOString(), b.toISOString()])).toEqual([
      [iso(0), iso(5)],
      [iso(70), iso(80)],
    ]);
  });

  it("handles unsorted and overlapping input", () => {
    const segs = segmentSpans([[t(10), t(20)], [t(0), t(15)], [t(12), t(13)]], 60);
    expect(segs).toEqual([[t(0), t(20)]]);
  });
});

describe("POST /agent-sessions/import", () => {
  beforeEach(resetDb);
  afterAll(disconnect);

  const session = (key: string, extra: Record<string, unknown> = {}) => ({
    sessionKey: key,
    agent: "claude_code",
    gitRemote: "git@github.com:acme/web.git",
    gitBranch: "main",
    spans: [
      [iso(0), iso(20)],
      [iso(25), iso(30)],
      [iso(120), iso(150)],
    ],
    ...extra,
  });

  it("previews with dryRun, then imports mapped sessions as stopped timers", async () => {
    const { user, auth } = await createUser({ agentIdleTimeoutSeconds: 900 });
    const acme = await createProject(user.id, { name: "Acme", hourlyRate: 100, repoPatterns: ["github.com/acme/web"] });

    const preview = await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ dryRun: true, sessions: [session("s1"), session("s2", { gitRemote: null, cwd: "/tmp/other" })] });
    expect(preview.status).toBe(200);
    expect(preview.body.totals).toMatchObject({ sessions: 2, trackedSeconds: 2 * 60 * 60, unassignedSeconds: 60 * 60 });
    expect(await prisma.timer.count()).toBe(0);

    const real = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session("s1")] });
    expect(real.body.sessions[0]).toMatchObject({ status: "imported", segments: 2, trackedSeconds: 3600 });
    const timer = await prisma.timer.findFirstOrThrow({ where: { sessionKey: "s1" } });
    expect(timer).toMatchObject({ status: "stopped", createdVia: "import", isAiGenerated: true, projectId: acme.id });
    const entries = await prisma.timeEntry.findMany({ where: { timerId: timer.id }, orderBy: { startTime: "asc" } });
    expect(entries.map((e) => e.duration)).toEqual([30 * 60, 30 * 60]);
    expect(entries.every((e) => e.hourlyRateSnapshot === 100 && e.stopReason === "import")).toBe(true);
  });

  it("re-imports idempotently and never touches live-tracked sessions", async () => {
    const { user, auth } = await createUser();
    await api().post("/agent-sessions/import").set(auth).send({ sessions: [session("s1")] });
    const longer = session("s1", { spans: [[iso(0), iso(160)]] }); // covers everything stored, and more
    const again = await api().post("/agent-sessions/import").set(auth).send({ sessions: [longer] });
    expect(again.body.sessions[0].status).toBe("replaced");
    expect(await prisma.timer.count()).toBe(1);
    expect(await prisma.timeEntry.count()).toBe(1);

    // A re-import that covers less (pruned transcripts, narrower window) is refused.
    const shorter = await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [session("s1", { spans: [[iso(100), iso(160)]] })] });
    expect(shorter.body.sessions[0].status).toBe("skipped_partial");
    expect(await prisma.timeEntry.count()).toBe(1);

    await api().post("/timers").set(auth).send({ sessionKey: "live-1" });
    const live = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session("live-1")] });
    expect(live.body.sessions[0].status).toBe("skipped_live");
    expect(await prisma.timeEntry.count({ where: { timer: { sessionKey: "live-1" } } })).toBe(1);
    expect(user.id).toBeTruthy();
  });

  it("rejects future timestamps per session without failing the batch", async () => {
    const { auth } = await createUser();
    const future = new Date(Date.now() + 3600_000).toISOString();
    const res = await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [session("ok"), session("bad", { spans: [[iso(0), future]] })] });
    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s: { status: string }) => s.status)).toEqual(["imported", "invalid"]);
  });

  it("accepts large payloads that the generic JSON guard would reject", async () => {
    const { auth } = await createUser();
    const spans = Array.from({ length: 2000 }, (_, i) => [iso(i), iso(i)]);
    const res = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session("big", { spans })] });
    expect(res.status).toBe(200);
    expect(res.body.sessions[0].status).toBe("imported");
  });
});

describe("request paths", () => {
  it("collapses a doubled leading slash from client base URLs", async () => {
    expect((await api().get("//health")).status).toBe(200);
  });
});

describe("S5 re-review: import guards and hook metadata", () => {
  beforeEach(resetDb);

  it("a re-import that covers less time between the same endpoints is refused", async () => {
    const { auth } = await createUser();
    await api().post("/agent-sessions/import").set(auth).send({ sessions: [{ sessionKey: "sub", spans: [[iso(0), iso(600)]] }] });
    // Same first and last moment, but a hole in the middle (a subagent file left out).
    const holey = { sessionKey: "sub", spans: [[iso(0), iso(200)], [iso(599), iso(600)]] };
    const again = await api().post("/agent-sessions/import").set(auth).send({ sessions: [holey] });
    expect(again.body.sessions[0].status).toBe("skipped_partial");
    expect(await prisma.timeEntry.aggregate({ _sum: { duration: true } })).toMatchObject({ _sum: { duration: 600 * 60 } });
  });

  it("a live-tracked session is reported as live, not as a partial import", async () => {
    const { auth } = await createUser();
    const started = await api().post("/agent-events").set(auth).send({ hook_event_name: "SessionStart", session_id: "live-x", cwd: "/tmp" });
    expect(started.status).toBe(200);
    const later = new Date(Date.now() + 2000).toISOString();
    const res = await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [{ sessionKey: "live-x", spans: [[new Date().toISOString(), later]] }] });
    expect(res.body.sessions[0].status).toBe("skipped_live");
  });

  it("an over-long branch or remote never stops a session from being tracked", async () => {
    const { auth } = await createUser();
    const res = await api()
      .post("/agent-events")
      .set(auth)
      .send({ hook_event_name: "SessionStart", session_id: "long", cwd: "/tmp/x", gitBranch: "b".repeat(309), gitRemote: "r".repeat(600) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tracked: true });
  });
});

describe("S5 review round 3", () => {
  beforeEach(resetDb);
  afterEach(() => jest.restoreAllMocks());

  it("lowering the idle timeout doesn't make an identical re-import look partial", async () => {
    const { user, auth } = await createUser();
    const session = { sessionKey: "gap", spans: [[iso(0), iso(20)], [iso(30), iso(50)]] };
    const first = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session] });
    expect(first.body.sessions[0]).toMatchObject({ status: "imported", trackedSeconds: 3000 });
    await prisma.user.update({ where: { id: user.id }, data: { agentIdleTimeoutSeconds: 300 } });
    const again = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session] });
    expect(again.body.sessions[0]).toMatchObject({ status: "replaced", trackedSeconds: 2400 });
  });

  it("the shrink check holds under the row lock (a fuller import may land in between)", async () => {
    const { auth } = await createUser();
    await api().post("/agent-sessions/import").set(auth).send({ sessions: [{ sessionKey: "k", spans: [[iso(0), iso(100)]] }] });
    const original = prisma.$transaction.bind(prisma) as (...a: unknown[]) => Promise<unknown>;
    let fuller: { body: { sessions: Array<{ status: string }> } } | null = null;
    let armed = true;
    jest.spyOn(prisma, "$transaction").mockImplementation((async (...a: unknown[]) => {
      if (armed && typeof a[0] === "function") {
        armed = false;
        fuller = await api().post("/agent-sessions/import").set(auth).send({ sessions: [{ sessionKey: "k", spans: [[iso(0), iso(300)]] }] });
      }
      return original(...a);
    }) as never);
    // Grows the stored copy at the first look, but covers less than the
    // fuller import that lands before its lock.
    const res = await api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [{ sessionKey: "k", spans: [[iso(0), iso(100)], [iso(200), iso(300)]] }] });
    jest.restoreAllMocks();
    expect(fuller!.body.sessions[0].status).toBe("replaced");
    expect(res.body.sessions[0].status).toBe("skipped_partial");
    expect(await prisma.timeEntry.aggregate({ _sum: { duration: true } })).toMatchObject({ _sum: { duration: 300 * 60 } });
  });

  it("an over-long Cursor workspace root is dropped, not an error", async () => {
    const { auth } = await createUser();
    const res = await api()
      .post("/agent-events")
      .set(auth)
      .send({ hook_event_name: "beforeSubmitPrompt", conversation_id: "cur-long", workspace_roots: ["/" + "a".repeat(1499)] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tracked: true });
    const timer = await prisma.timer.findFirstOrThrow({ where: { sessionKey: { contains: "cur-long" } } });
    expect(timer.cwd).toBeNull();
  });
});

describe("S5 review round 4", () => {
  beforeEach(resetDb);

  it.each([
    // At the lower timeout the lone message stands alone and is dropped.
    ["a lone last message", [[0, 60], [72, 72]], 3600],
    ["a lone first message", [[0, 0], [12, 60]], 2880],
  ])("lowering the idle timeout with %s still replaces an identical import", async (_label, mins, seconds) => {
    const { user, auth } = await createUser();
    const session = { sessionKey: "lone", spans: (mins as number[][]).map(([a, b]) => [iso(a), iso(b)]) };
    expect((await api().post("/agent-sessions/import").set(auth).send({ sessions: [session] })).body.sessions[0].status).toBe("imported");
    await prisma.user.update({ where: { id: user.id }, data: { agentIdleTimeoutSeconds: 600 } });
    const again = await api().post("/agent-sessions/import").set(auth).send({ sessions: [session] });
    expect(again.body.sessions[0]).toMatchObject({ status: "replaced", trackedSeconds: seconds });
  });

  it.each([
    ["an over-long first root", ["/" + "a".repeat(2100)]],
    ["an over-long later root", ["/w/ok", "/" + "b".repeat(2100)]],
    ["many roots", Array.from({ length: 21 }, (_, i) => `/w/${i}`)],
    ["a malformed list", "not-a-list"],
  ])("a Cursor event with %s is still tracked", async (_label, roots) => {
    const { auth } = await createUser();
    const res = await api()
      .post("/agent-events")
      .set(auth)
      .send({ hook_event_name: "beforeSubmitPrompt", conversation_id: `cur-${_label}`, workspace_roots: roots });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tracked: true });
  });
});

