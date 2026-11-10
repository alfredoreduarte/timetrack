// Characterization tests for the endpoints the native apps (mac, iOS, watch)
// and the web UI depend on. If one of these breaks, a shipped client breaks.
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

describe("legacy time-entry endpoints", () => {
  it("starts a timer with the rate cascade task > project > user", async () => {
    const { user, auth } = await createUser({ defaultHourlyRate: 50 });
    const project = await createProject(user.id, { hourlyRate: 80 });
    const task = await createTask(user.id, project.id, { hourlyRate: 120 });

    const userOnly = await api().post("/time-entries/start").set(auth).send({});
    expect(userOnly.status).toBe(201);
    expect(userOnly.body.timeEntry).toMatchObject({
      isRunning: true,
      hourlyRateSnapshot: 50,
      createdVia: "web",
      isAiGenerated: false,
    });

    const withProject = await api()
      .post("/time-entries/start")
      .set(auth)
      .send({ projectId: project.id, description: "Design review" });
    expect(withProject.body.timeEntry.hourlyRateSnapshot).toBe(80);
    expect(withProject.body.timeEntry.project).toMatchObject({ id: project.id });

    const withTask = await api()
      .post("/time-entries/start")
      .set(auth)
      .send({ projectId: project.id, taskId: task.id });
    expect(withTask.body.timeEntry.hourlyRateSnapshot).toBe(120);
    expect(withTask.body.timeEntry.task).toMatchObject({ id: task.id });
  });

  it("labels API-key entries as AI work and honours X-Client / X-AI-Generated", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id);

    const viaKey = await api().post("/time-entries/start").set(key.auth).send({});
    expect(viaKey.body.timeEntry).toMatchObject({ createdVia: "api", isAiGenerated: true });

    const viaMcp = await api()
      .post("/time-entries/start")
      .set(key.auth)
      .set("X-Client", "mcp")
      .send({});
    expect(viaMcp.body.timeEntry.createdVia).toBe("mcp");

    const optOut = await api()
      .post("/time-entries/start")
      .set(key.auth)
      .set("X-AI-Generated", "false")
      .send({});
    expect(optOut.body.timeEntry.isAiGenerated).toBe(false);
  });

  it("supports concurrent running timers via /running and the legacy /current", async () => {
    const { auth } = await createUser();
    const first = await api().post("/time-entries/start").set(auth).send({ description: "A" });
    await new Promise((r) => setTimeout(r, 10));
    const second = await api().post("/time-entries/start").set(auth).send({ description: "B" });

    const running = await api().get("/time-entries/running").set(auth);
    expect(running.status).toBe(200);
    expect(running.body.timeEntries.map((e: { id: string }) => e.id)).toEqual([
      second.body.timeEntry.id,
      first.body.timeEntry.id,
    ]);

    const current = await api().get("/time-entries/current").set(auth);
    expect(current.body.timeEntry.id).toBe(second.body.timeEntry.id);
    expect(current.headers.deprecation).toBe("true");
  });

  it("returns { timeEntry: null } from /current when nothing runs", async () => {
    const { auth } = await createUser();
    const current = await api().get("/time-entries/current").set(auth);
    expect(current.status).toBe(200);
    expect(current.body).toEqual({ timeEntry: null });
  });

  it("stops a running entry and computes its duration", async () => {
    const { auth } = await createUser();
    const started = await api().post("/time-entries/start").set(auth).send({});
    const id = started.body.timeEntry.id;
    const endTime = new Date(
      new Date(started.body.timeEntry.startTime).getTime() + 90_000
    ).toISOString();

    const stopped = await api().post(`/time-entries/${id}/stop`).set(auth).send({ endTime });
    expect(stopped.status).toBe(200);
    expect(stopped.body.timeEntry).toMatchObject({ isRunning: false, duration: 90 });

    const again = await api().post(`/time-entries/${id}/stop`).set(auth).send({});
    expect(again.status).toBe(400);
  });

  it("isolates users from each other's entries, projects and tasks", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const bobsProject = await createProject(bob.user.id);
    const bobsTask = await createTask(bob.user.id, bobsProject.id);

    const started = await api().post("/time-entries/start").set(alice.auth).send({});
    const id = started.body.timeEntry.id;

    expect((await api().post(`/time-entries/${id}/stop`).set(bob.auth).send({})).status).toBe(404);
    expect((await api().put(`/time-entries/${id}`).set(bob.auth).send({ description: "x" })).status).toBe(404);
    expect((await api().delete(`/time-entries/${id}`).set(bob.auth)).status).toBe(404);
    expect(
      (await api().post("/time-entries/start").set(alice.auth).send({ projectId: bobsProject.id })).status
    ).toBe(404);
    expect(
      (await api().post("/time-entries/start").set(alice.auth).send({ taskId: bobsTask.id })).status
    ).toBe(404);
  });

  it("creates manual entries and rejects end <= start", async () => {
    const { auth } = await createUser();
    const bad = await api()
      .post("/time-entries")
      .set(auth)
      .send({ startTime: "2026-01-10T10:00:00.000Z", endTime: "2026-01-10T10:00:00.000Z" });
    expect(bad.status).toBe(400);

    const ok = await api()
      .post("/time-entries")
      .set(auth)
      .send({
        startTime: "2026-01-10T10:00:00.000Z",
        endTime: "2026-01-10T11:30:00.000Z",
        description: "Backfill",
      });
    expect(ok.status).toBe(201);
    expect(ok.body.timeEntry).toMatchObject({ isRunning: false, duration: 5400 });
  });

  it("edits a stopped entry by hours and by explicit times", async () => {
    const { auth } = await createUser();
    const created = await api()
      .post("/time-entries")
      .set(auth)
      .send({ startTime: "2026-01-10T09:00:00.000Z", endTime: "2026-01-10T17:00:00.000Z" });
    const id = created.body.timeEntry.id;

    const byHours = await api().put(`/time-entries/${id}`).set(auth).send({ hours: 2 });
    expect(byHours.status).toBe(200);
    expect(byHours.body.timeEntry).toMatchObject({
      duration: 7200,
      endTime: "2026-01-10T11:00:00.000Z",
    });

    const byTimes = await api()
      .put(`/time-entries/${id}`)
      .set(auth)
      .send({ startTime: "2026-01-10T10:00:00.000Z" });
    expect(byTimes.body.timeEntry.duration).toBe(3600);

    const inverted = await api()
      .put(`/time-entries/${id}`)
      .set(auth)
      .send({ startTime: "2026-01-10T12:00:00.000Z" });
    expect(inverted.status).toBe(400);
  });

  it("deletes entries", async () => {
    const { auth } = await createUser();
    const started = await api().post("/time-entries/start").set(auth).send({});
    const id = started.body.timeEntry.id;
    expect((await api().delete(`/time-entries/${id}`).set(auth)).status).toBe(200);
    expect((await api().delete(`/time-entries/${id}`).set(auth)).status).toBe(404);
  });

  it("lists entries with pagination metadata", async () => {
    const { auth } = await createUser();
    for (let i = 0; i < 3; i++) {
      await api()
        .post("/time-entries")
        .set(auth)
        .send({
          startTime: `2026-01-1${i}T09:00:00.000Z`,
          endTime: `2026-01-1${i}T10:00:00.000Z`,
        });
    }
    const list = await api().get("/time-entries?limit=2").set(auth);
    expect(list.status).toBe(200);
    expect(list.body.entries).toHaveLength(2);
    expect(list.body.pagination).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });
    // Most recent first
    expect(list.body.entries[0].startTime).toBe("2026-01-12T09:00:00.000Z");
  });

  it("rejects unauthenticated and malformed-token requests", async () => {
    expect((await api().get("/time-entries/running")).status).toBe(401);
    expect(
      (await api().get("/time-entries/running").set("Authorization", "Bearer tt_nope")).status
    ).toBe(401);
  });
});
