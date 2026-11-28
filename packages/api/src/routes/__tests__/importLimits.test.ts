import * as imports from "../../services/imports";
import { importRequestBytes, IMPORT_ROW_BYTES } from "../../services/imports";
import * as text from "../../services/text";
import { api, resetDb, createUser, disconnect } from "../../test/helpers";
import { prisma } from "../../utils/database";

const LIMITS = [
  "AGENT_IMPORTS_PER_HOUR",
  "AGENT_IMPORTS_CONCURRENT",
  "AGENT_IMPORTS_PER_ACCOUNT",
  "AGENT_IMPORTS_QUEUED",
  "AGENT_IMPORT_WAIT_MS",
  "AGENT_IMPORT_MB_PER_DAY",
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
    expect(again.body).toMatchObject({ code: "import_busy", error: expect.stringMatching(/Another import for this account/) });
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
    expect(again.body).toMatchObject({ code: "import_busy", error: expect.stringMatching(/Another import for this account/) });
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
  const writeBody = (sessionKey: string, segments = 2) => ({
    sessions: [{ sessionKey, spans: [[at(5), at(4.9)], [at(3), at(2.9)], [at(1), at(0.9)]].slice(0, segments) as [string, string][] }],
  });
  const write = (auth: Record<string, string>, b: ReturnType<typeof writeBody>) =>
    api().post("/agent-sessions/import").set(auth).send(b);
  const MB = 1024 * 1024;
  /** Sets the daily cap to `bytes`, give or take half a byte. */
  const capAt = (bytes: number) => (process.env.AGENT_IMPORT_MB_PER_DAY = String(bytes / MB));
  /** What the budget has charged the account: an audit row each, plus growth. */
  async function charged(userId: string) {
    const rows = await prisma.auditEvent.findMany({ where: { userId, entityType: "timer" }, select: { changes: true } });
    return rows.reduce((sum, r) => {
      const b = (r.changes as { storedBytes: { from: number | null; to: number } }).storedBytes;
      return sum + IMPORT_ROW_BYTES.audit + Math.max(b.to - (b.from ?? 0), 0);
    }, 0);
  }

  it("caps what an account adds per day, checking each request at its largest size first", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const s1 = writeBody("s1");
    const most = importRequestBytes(s1.sessions);
    capAt(most - 0.5);
    const over = await write(a.auth, s1);
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ code: "import_daily_limit", error: expect.stringMatching(/as much as it can today/) });
    capAt(most + 0.5);
    expect((await write(a.auth, s1)).body.sessions[0].status).toBe("imported");
    // The estimate before the import bounds what it then records.
    const used = await charged(a.user.id);
    expect(used).toBeLessThanOrEqual(most);
    // Previews write nothing and still run; other accounts have their own budget.
    capAt(1);
    expect((await send(a.auth)).status).toBe(200);
    capAt(most + 0.5);
    expect((await write(a.auth, writeBody("s2"))).status).toBe(429);
    expect((await write(b.auth, s1)).status).toBe(200);
    // A day later the budget is back.
    await prisma.auditEvent.updateMany({
      where: { userId: a.user.id },
      data: { createdAt: new Date(Date.now() - 25 * 3600_000) },
    });
    expect((await write(a.auth, writeBody("s2"))).status).toBe(200);
  });

  it("charges a re-import only its audit row and what it adds", async () => {
    const a = await createUser();
    expect((await write(a.auth, writeBody("s1"))).body.sessions[0].status).toBe("imported");
    const first = await charged(a.user.id);
    expect((await write(a.auth, writeBody("s1"))).body.sessions[0].status).toBe("replaced");
    expect(await charged(a.user.id)).toBe(first + IMPORT_ROW_BYTES.audit);
    expect((await write(a.auth, writeBody("s1", 3))).body.sessions[0]).toMatchObject({ status: "replaced", segments: 3 });
    const used = await charged(a.user.id);
    expect(used).toBeGreaterThan(first + 2 * IMPORT_ROW_BYTES.audit);
    // Exactly what the budget counts: one more byte and the next is refused.
    const s2 = writeBody("s2");
    capAt(used + importRequestBytes(s2.sessions) - 0.5);
    expect((await write(a.auth, s2)).status).toBe(429);
    capAt(used + importRequestBytes(s2.sessions) + 0.5);
    expect((await write(a.auth, s2)).status).toBe(200);
  });

  it("bounds, before an import, what it then records, whatever the fields hold", async () => {
    const a = await createUser();
    const spans = writeBody("x").sessions[0].spans;
    const long = (c: string, n: number) => c.repeat(n);
    const shapes = [
      { sessionKey: "plain", spans },
      { sessionKey: "blank-title", title: "   ", cwd: "/Users/someone/dev/app", gitBranch: "main", spans },
      { sessionKey: "unknown-agent", agent: "Some_Agent", gitRemote: "https://github.com/someone/app.git", spans },
      {
        sessionKey: long("k", 200),
        agent: "codex",
        title: long("t", 500),
        cwd: "/" + long("c", 999),
        gitRemote: "github.com/" + long("r", 480),
        gitBranch: long("b", 255),
        spans,
        usage: { [long("m", 100)]: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 } },
      },
      { sessionKey: long("鍵", 200), title: long("題", 500), cwd: "/" + long("路", 999), gitBranch: long("枝", 255), spans },
      // Text that grows when it is cleaned: decoded entities, NUL inside a
      // textarea, a junk remote that leaves the cwd's last folder as the
      // label, an internationalized host that is punycoded.
      { sessionKey: "entities", title: long("&nGt;", 100), spans },
      { sessionKey: "nul", title: "<textarea>" + long("\u0000", 490), spans },
      { sessionKey: "leaf", gitRemote: long("~", 500), cwd: "/" + long("a", 600) + "/" + long("路", 300), spans },
      { sessionKey: "idn", gitRemote: "https://" + long("ü", 200) + ".example/org/repo.git", spans },
    ];
    for (const shape of shapes) {
      const res = await api().post("/agent-sessions/import").set(a.auth).send({ sessions: [shape] });
      expect(res.body.sessions[0].status).toBe("imported");
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { userId: a.user.id, entityType: "timer", entityId: res.body.sessions[0].timerId },
      });
      const recorded = (audit.changes as { storedBytes: { to: number } }).storedBytes.to;
      expect(IMPORT_ROW_BYTES.audit + recorded).toBeLessThanOrEqual(importRequestBytes([shape as imports.ImportSessionInput]));
    }
  });

  it("counts another import of the account that is still writing (when more than one may run)", async () => {
    process.env.AGENT_IMPORTS_PER_ACCOUNT = "2";
    const a = await createUser();
    const [s1, s2] = [writeBody("s1"), writeBody("s2")];
    const [b1, b2] = [importRequestBytes(s1.sessions), importRequestBytes(s2.sessions)];
    capAt(b1 + b2 - 0.5);
    const held = holdImports(1);
    const first = write(a.auth, s1).then((r) => r);
    await until(() => held.started.length === 1);
    let second;
    try {
      second = await write(a.auth, s2); // the first has written nothing yet
    } finally {
      held.release();
    }
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("import_daily_limit");
    expect((await first).status).toBe(200);
    // Once it finished, only what it recorded counts.
    capAt((await charged(a.user.id)) + b2 + 0.5);
    expect((await write(a.auth, s2)).status).toBe(200);
  });

  it("labels an agent named like an Object property by its name", async () => {
    const a = await createUser();
    const res = await api()
      .post("/agent-sessions/import")
      .set(a.auth)
      .send({ sessions: [{ ...writeBody("k").sessions[0], agent: "constructor", cwd: "/Users/someone/dev/app" }] });
    expect(res.body.sessions[0].status).toBe("imported");
    const timer = await prisma.timer.findFirstOrThrow({ where: { userId: a.user.id } });
    expect(timer.description).toBe("constructor · app");
  });

  // Nested markup is what makes HTML sanitizing slow.
  const markup = (sessionKey: string) => ({
    sessionKey,
    title: "<div>".repeat(100),
    cwd: "/" + "<div>".repeat(150),
    gitBranch: "<div>".repeat(50),
    spans: writeBody("x").sessions[0].spans,
  });

  it("refuses an import over the cap without sanitizing it first", async () => {
    const a = await createUser();
    const sessions = Array.from({ length: 100 }, (_, i) => markup(`m${i}`));
    capAt(1);
    const started = Date.now();
    const res = await api().post("/agent-sessions/import").set(a.auth).send({ sessions });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("import_daily_limit");
  });

  it("sanitizes descriptions only when it writes them, once per session", async () => {
    const a = await createUser();
    const clean = jest.spyOn(text, "cleanText");
    const described = () => clean.mock.calls.filter(([, field]) => field === "title" || field === "description").length;
    const sessions = [markup("m1"), { ...markup("m2"), title: "Invoice export" }];
    expect((await api().post("/agent-sessions/import").set(a.auth).send({ dryRun: true, sessions })).status).toBe(200);
    expect(described()).toBe(0);
    expect((await api().post("/agent-sessions/import").set(a.auth).send({ sessions })).status).toBe(200);
    // m1's title cleans to nothing, so its generated description is cleaned too.
    expect(described()).toBe(3);
  });

  it("checks a sessionKey repeated in one request only once", async () => {
    const a = await createUser();
    const one = writeBody("k").sessions[0];
    const res = await api()
      .post("/agent-sessions/import")
      .set(a.auth)
      .send({ sessions: [one, one, { ...one, spans: one.spans.slice(0, 1) }] });
    expect(res.body.sessions.map((r: { status: string }) => r.status)).toEqual(["imported", "invalid", "invalid"]);
    expect(res.body.sessions[1].reason).toMatch(/more than once/);
    expect(await prisma.timer.count({ where: { userId: a.user.id } })).toBe(1);
  });

  it("refuses bodies over 1 MB", async () => {
    const a = await createUser();
    const spans = Array.from({ length: 9000 }, (_, i) => [at(100 - i * 0.01), at(100 - i * 0.01 - 0.001)]);
    const big = { dryRun: true, sessions: ["big", "big2", "big3"].map((sessionKey) => ({ sessionKey, spans })) };
    expect(Buffer.byteLength(JSON.stringify(big))).toBeGreaterThan(1024 * 1024);
    expect((await api().post("/agent-sessions/import").set(a.auth).send(big)).status).toBe(413);
  });
});
