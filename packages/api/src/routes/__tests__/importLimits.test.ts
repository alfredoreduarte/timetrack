import * as imports from "../../services/imports";
import { api, resetDb, createUser, disconnect } from "../../test/helpers";

beforeEach(async () => {
  await resetDb();
  for (const k of ["AGENT_IMPORTS_PER_HOUR", "AGENT_IMPORTS_CONCURRENT", "AGENT_IMPORTS_PER_ACCOUNT", "AGENT_IMPORT_WAIT_MS"]) delete process.env[k];
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  for (const k of ["AGENT_IMPORTS_PER_HOUR", "AGENT_IMPORTS_CONCURRENT", "AGENT_IMPORTS_PER_ACCOUNT", "AGENT_IMPORT_WAIT_MS"]) delete process.env[k];
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

  /** Holds the next n imports until released; reports each one as it starts. */
  function holdImports(n: number) {
    const real = imports.importAgentSessions;
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const spy = jest.spyOn(imports, "importAgentSessions");
    for (let i = 0; i < n; i++) {
      spy.mockImplementationOnce(async (...args) => {
        started.push(args[0].userId);
        await gate;
        return real(...args);
      });
    }
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
    expect(held.started).toEqual([a.user.id]); // b and c are waiting, not running
    held.release();
    const [r1, r2, r3] = await Promise.all([first, second, third]);
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);
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
    held.release();
    await Promise.all([first, second, third]);
    expect(held.started).toEqual([a.user.id, b.user.id, c.user.id]);
  });

  it("gives up with a 429 after waiting too long", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    process.env.AGENT_IMPORT_WAIT_MS = "100";
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
    expect(second.body.error).toMatch(/Other imports are running/);
    expect((await first).status).toBe(200);
    // The timed-out wait left the line: the next import runs at once.
    expect((await send(b.auth)).status).toBe(200);
  });

  it("lets one account have only a couple of imports running or waiting", async () => {
    process.env.AGENT_IMPORTS_PER_ACCOUNT = "1";
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
    expect(again.body.error).toMatch(/one at a time/);
    expect(other.status).toBe(200);
    expect((await first).status).toBe(200);
    expect((await send(a.auth)).status).toBe(200);
  });

  it("frees the slot when an import fails", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    const a = await createUser();
    jest.spyOn(imports, "importAgentSessions").mockRejectedValueOnce(new Error("boom"));
    expect((await api().post("/agent-sessions/import").set(a.auth).send(body())).status).toBe(500);
    expect((await api().post("/agent-sessions/import").set(a.auth).send(body())).status).toBe(200);
  });

  it("refuses bodies over 1 MB", async () => {
    const a = await createUser();
    const spans = Array.from({ length: 9000 }, (_, i) => [at(100 - i * 0.01), at(100 - i * 0.01 - 0.001)]);
    const big = { dryRun: true, sessions: ["big", "big2", "big3"].map((sessionKey) => ({ sessionKey, spans })) };
    expect(Buffer.byteLength(JSON.stringify(big))).toBeGreaterThan(1024 * 1024);
    expect((await api().post("/agent-sessions/import").set(a.auth).send(big)).status).toBe(413);
  });
});
