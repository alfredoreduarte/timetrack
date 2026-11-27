import * as imports from "../../services/imports";
import { api, resetDb, createUser, disconnect } from "../../test/helpers";

beforeEach(async () => {
  await resetDb();
  delete process.env.AGENT_IMPORTS_PER_HOUR;
  delete process.env.AGENT_IMPORTS_CONCURRENT;
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  delete process.env.AGENT_IMPORTS_PER_HOUR;
  delete process.env.AGENT_IMPORTS_CONCURRENT;
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

  it("runs only so many imports at once across everyone, and frees the slot when one ends", async () => {
    process.env.AGENT_IMPORTS_CONCURRENT = "1";
    const a = await createUser();
    const b = await createUser();
    const real = imports.importAgentSessions;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started!: () => void;
    const isRunning = new Promise<void>((r) => (started = r));
    jest.spyOn(imports, "importAgentSessions").mockImplementationOnce(async (...args) => {
      started();
      await gate;
      return real(...args);
    });

    // .then() sends it now (supertest requests are lazy).
    const first = api().post("/agent-sessions/import").set(a.auth).send(body()).then((r) => r);
    await isRunning;
    let second;
    try {
      second = await api().post("/agent-sessions/import").set(b.auth).send(body());
    } finally {
      release(); // even if that failed, so nothing is left hanging
    }
    expect(second.status).toBe(429);
    expect(second.body.error).toMatch(/Other imports are running/);
    expect((await first).status).toBe(200);
    expect((await api().post("/agent-sessions/import").set(b.auth).send(body())).status).toBe(200);
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
