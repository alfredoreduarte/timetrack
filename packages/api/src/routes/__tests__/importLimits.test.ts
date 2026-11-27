import * as imports from "../../services/imports";
import { api, resetDb, createUser, disconnect } from "../../test/helpers";
import { prisma } from "../../utils/database";

const LIMITS = [
  "AGENT_IMPORTS_PER_HOUR",
  "AGENT_IMPORTS_CONCURRENT",
  "AGENT_IMPORTS_PER_ACCOUNT",
  "AGENT_IMPORTS_QUEUED",
  "AGENT_IMPORT_WAIT_MS",
  "AGENT_IMPORT_SEGMENTS_PER_DAY",
  "AGENT_IMPORT_SESSIONS_PER_DAY",
];
// Gates still closed when a test ends (it failed early): opened so its
// held imports finish and give their slots back before the next test.
const openGates: Array<() => void> = [];

beforeEach(async () => {
  await resetDb();
  for (const k of LIMITS) delete process.env[k];
});
afterEach(async () => {
  const left = openGates.splice(0);
  for (const open of left) open();
  if (left.length > 0) await new Promise((r) => setTimeout(r, 200));
  jest.restoreAllMocks();
});
afterAll(async () => {
  for (const k of LIMITS) delete process.env[k];
  await disconnect();
});

const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
const body = (key = "s1") => ({ dryRun: true, sessions: [{ sessionKey: key, spans: [[at(2), at(1.9)]] }] });

describe("transcript import limits", () => {
  it("caps imports per account per hour, without pausing other accounts", async () => {
    process.env.AGENT_IMPORTS_PER_HOUR = "3";
    const a = await createUser();
    const b = await createUser();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await api().post("/agent-sessions/import").set(a.auth).send(body())).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    const limited = await api().post("/agent-sessions/import").set(a.auth).send(body());
    expect(limited.body.error).toMatch(/Too many imports/);
    // The web app pauses everything on a Retry-After; importers just retry later.
    expect(limited.headers["retry-after"]).toBeUndefined();
    expect((await api().post("/agent-sessions/import").set(b.auth).send(body())).status).toBe(200);
  });

  /** Records every import as it starts; holds the first n until released. */
  function holdImports(n: number) {
    const real = imports.importAgentSessions;
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    openGates.push(() => release());
    let toHold = n;
    jest.spyOn(imports, "importAgentSessions").mockImplementation(async (...args) => {
      started.push(args[0].userId);
      if (toHold-- > 0) await gate;
      return real(...args);
    });
    return { started, release };
  }
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  };
  // .then() sends it now (supertest requests are lazy).
  const send = (auth: Record<string, string>) => api().post("/agent-sessions/import").set(auth).send(body()).then((r) => r);

  it("runs only so many imports at once; the next waits its turn instead of failing", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const held = holdImports(1);
    const first = send(a.auth);
    await until(() => held.started.length === 1);
    const second = send(b.auth);
    const third = send(c.auth);
    await new Promise((r) => setTimeout(r, 100));
    try {
      expect(held.started).toEqual([a.user.id]); // b and c are waiting, not running
    } finally {
      held.release();
    }
    const [r1, r2, r3] = await Promise.all([first, second, third]);
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);
    expect(held.started).toEqual([a.user.id, b.user.id, c.user.id]);
  });

  it("serves waiting imports in arrival order", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const held = holdImports(3);
    const first = send(a.auth);
    await until(() => held.started.length === 1);
    const second = send(b.auth);
    await new Promise((r) => setTimeout(r, 50));
    const third = send(c.auth);
    await new Promise((r) => setTimeout(r, 50));
    try {
      expect(held.started).toEqual([a.user.id]);
    } finally {
      held.release();
    }
    await Promise.all([first, second, third]);
    expect(held.started).toEqual([a.user.id, b.user.id, c.user.id]);
  });

  it("gives up with a 429 after waiting too long", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    process.env.AGENT_IMPORT_WAIT_MS = "100";
    // One per account, so the retry below proves the wait gave its count back.
    process.env.AGENT_IMPORTS_PER_ACCOUNT = "1";
    const [a, b] = [await createUser(), await createUser()];
    const held = holdImports(1);
    const first = send(a.auth);
    await until(() => held.started.length === 1);
    let second;
    try {
      second = await send(b.auth);
    } finally {
      held.release(); // even if that failed, so nothing is left hanging
    }
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({ code: "import_busy", error: expect.stringMatching(/Other imports are running/) });
    expect((await first).status).toBe(200);
    // The timed-out wait left the line: the next import runs at once.
    expect((await send(b.auth)).status).toBe(200);
  });

  it("lets one account have only one import running or waiting (the default)", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const held = holdImports(1);
    const first = send(a.auth);
    await until(() => held.started.length === 1);
    let again;
    let other;
    try {
      again = await send(a.auth);
      other = await send(b.auth); // another account still gets in (2 slots)
    } finally {
      held.release();
    }
    expect(again.status).toBe(429);
    expect(again.body).toMatchObject({ code: "import_busy", error: expect.stringMatching(/one at a time/) });
    expect(other.status).toBe(200);
    expect((await first).status).toBe(200);
    expect((await send(a.auth)).status).toBe(200);
  });

  it("counts a waiting import as the account's one", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    process.env.AGENT_IMPORTS_PER_ACCOUNT = "1";
    const [a, b] = [await createUser(), await createUser()];
    const held = holdImports(1);
    const first = send(a.auth);
    await until(() => held.started.length === 1);
    const waiting = send(b.auth);
    await new Promise((r) => setTimeout(r, 50));
    let again;
    try {
      again = await send(b.auth); // b's first is still waiting
    } finally {
      held.release();
    }
    expect(again.status).toBe(429);
    expect(again.body).toMatchObject({ code: "import_busy", error: expect.stringMatching(/one at a time/) });
    expect((await first).status).toBe(200);
    expect((await waiting).status).toBe(200);
    expect(held.started).toEqual([a.user.id, b.user.id]);
  });

  it("lets only so many wait; the rest hear the server is busy", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    process.env.AGENT_IMPORTS_QUEUED = "1";
    // One per account, so the retry below proves the rejection gave its count back.
    process.env.AGENT_IMPORTS_PER_ACCOUNT = "1";
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const held = holdImports(1);
    const first = send(a.auth);
    await until(() => held.started.length === 1);
    const second = send(b.auth); // waits
    await new Promise((r) => setTimeout(r, 50));
    let third;
    try {
      third = await send(c.auth); // line full
    } finally {
      held.release();
    }
    expect(third.status).toBe(429);
    expect(third.body.code).toBe("import_busy");
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    // Turned away before waiting: its count came back too.
    expect((await send(c.auth)).status).toBe(200);
  });

  it("frees the slot when an import fails", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    // One per account, so the retry below proves the failure gave its count back.
    process.env.AGENT_IMPORTS_PER_ACCOUNT = "1";
    const a = await createUser();
    jest.spyOn(imports, "importAgentSessions").mockRejectedValueOnce(new Error("boom"));
    expect((await api().post("/agent-sessions/import").set(a.auth).send(body())).status).toBe(500);
    expect((await api().post("/agent-sessions/import").set(a.auth).send(body())).status).toBe(200);
  });

  // An hour apart: a segment each at the default idle timeout.
  const write = (auth: Record<string, string>, sessionKey: string, segments = 2) =>
    api()
      .post("/agent-sessions/import")
      .set(auth)
      .send({ sessions: [{ sessionKey, spans: [[at(5), at(4.9)], [at(3), at(2.9)], [at(1), at(0.9)]].slice(0, segments) }] });

  it("caps the segments an account adds per day; a re-import counts only what it adds", async () => {
    process.env.AGENT_IMPORT_SEGMENTS_PER_DAY = "5";
    const [a, b] = [await createUser(), await createUser()];
    expect((await write(a.auth, "s1")).body.sessions[0]).toMatchObject({ status: "imported", segments: 2 }); // 2
    expect((await write(a.auth, "s1")).body.sessions[0]).toMatchObject({ status: "replaced", segments: 2 }); // 2
    expect((await write(a.auth, "s1", 3)).body.sessions[0]).toMatchObject({ status: "replaced", segments: 3 }); // 3
    expect((await write(a.auth, "s2")).status).toBe(200); // started under the cap: 5
    const over = await write(a.auth, "s3");
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ code: "import_daily_limit", error: expect.stringMatching(/as much as it can today/) });
    // Previews write nothing and still run; other accounts have their own budget.
    expect((await send(a.auth)).status).toBe(200);
    expect((await write(b.auth, "s1")).status).toBe(200);
    // A day later the budget is back.
    await prisma.auditEvent.updateMany({
      where: { userId: a.user.id },
      data: { createdAt: new Date(Date.now() - 25 * 3600_000) },
    });
    expect((await write(a.auth, "s3")).status).toBe(200);
  });

  it("caps the sessions an account writes per day, re-imports included", async () => {
    process.env.AGENT_IMPORT_SESSIONS_PER_DAY = "2";
    const a = await createUser();
    expect((await write(a.auth, "s1")).status).toBe(200);
    expect((await write(a.auth, "s1")).body.sessions[0].status).toBe("replaced");
    const over = await write(a.auth, "s1");
    expect(over.status).toBe(429);
    expect(over.body.code).toBe("import_daily_limit");
  });

  it("refuses bodies over 1 MB", async () => {
    const a = await createUser();
    const spans = Array.from({ length: 9000 }, (_, i) => [at(100 - i * 0.01), at(100 - i * 0.01 - 0.001)]);
    const big = { dryRun: true, sessions: ["big", "big2", "big3"].map((sessionKey) => ({ sessionKey, spans })) };
    expect(Buffer.byteLength(JSON.stringify(big))).toBeGreaterThan(1024 * 1024);
    expect((await api().post("/agent-sessions/import").set(a.auth).send(big)).status).toBe(413);
  });
});
