import { prisma } from "../../utils/database";
import { api, resetDb, createUser, createApiKey, createProject, disconnect } from "../../test/helpers";

beforeEach(resetDb);
afterAll(disconnect);

let rpcId = 0;
async function rpc(auth: Record<string, string>, method: string, params: Record<string, unknown> = {}) {
  rpcId += 1;
  const res = await api()
    .post("/mcp")
    .set(auth)
    .set("Accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id: rpcId, method, params });
  return res;
}

async function call(auth: Record<string, string>, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc(auth, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  const result = res.body.result;
  const text: string = result.content[0].text;
  return { isError: Boolean(result.isError), text, data: result.isError ? null : JSON.parse(text) };
}

describe("remote MCP endpoint", () => {
  it("initializes with instructions and lists the agent toolset", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const init = await rpc(key.auth, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("timetrack");
    expect(init.body.result.instructions).toMatch(/parallel/);

    const list = await rpc(key.auth, "tools/list");
    const names = list.body.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(
      [
        "add_note",
        "bulk_update_entries",
        "create_entry",
        "create_project",
        "create_task",
        "delete_entry",
        "entry_history",
        "get_timer",
        "heartbeat_timer",
        "list_entries",
        "list_projects",
        "list_tasks",
        "list_timers",
        "pause_timer",
        "resume_timer",
        "start_timer",
        "stop_timer",
        "update_entry",
        "update_project",
        "update_task",
        "update_timer",
        "whoami",
      ].sort()
    );
    // No legacy single-timer language anywhere in tool descriptions.
    expect(JSON.stringify(list.body.result.tools)).not.toMatch(/only one timer|current_timer/i);
  });

  it("runs parallel timers, pauses, edits past entries and logs notes", async () => {
    const { user } = await createUser();
    const key = await createApiKey(user.id, { name: "Claude Code" });
    const project = await createProject(user.id, { name: "Acme", repoPatterns: ["github.com/acme/web"] });

    const a = await call(key.auth, "start_timer", { sessionKey: "s-a", description: "API", gitRemote: "git@github.com:acme/web.git" });
    const b = await call(key.auth, "start_timer", { sessionKey: "s-b", description: "UI" });
    expect(a.data.timer.project).toMatchObject({ id: project.id });
    expect(a.data.matchedRepoPattern).toBe("github.com/acme/web");
    expect(b.data.created).toBe(true);

    // Idempotent restart of the same session
    const again = await call(key.auth, "start_timer", { sessionKey: "s-a" });
    expect(again.data.created).toBe(false);
    expect(again.data.timer.id).toBe(a.data.timer.id);

    const ambiguous = await call(key.auth, "stop_timer", {});
    expect(ambiguous.data).toMatchObject({ stopped: false });
    expect(ambiguous.data.running).toHaveLength(2);

    expect((await call(key.auth, "pause_timer", { timerId: b.data.timer.id })).data.timer.status).toBe("paused");
    expect((await call(key.auth, "add_note", { timerId: a.data.timer.id, note: "Added pagination" })).data.note.body).toBe("Added pagination");

    const stopOne = await call(key.auth, "stop_timer", {});
    expect(stopOne.data).toMatchObject({ stopped: true });
    expect(stopOne.data.timer.id).toBe(a.data.timer.id);

    // Edit a past entry
    const backfill = await call(key.auth, "create_entry", {
      startTime: new Date(Date.now() - 3 * 3600_000).toISOString(),
      endTime: new Date(Date.now() - 2 * 3600_000).toISOString(),
      description: "Forgot to track",
    });
    const edited = await call(key.auth, "update_entry", {
      entryId: backfill.data.entry.id,
      description: "Investigated flaky CI",
      projectId: project.id,
    });
    expect(edited.data.entry).toMatchObject({ description: "Investigated flaky CI", projectId: project.id });
    const history = await call(key.auth, "entry_history", { entryId: backfill.data.entry.id });
    expect(history.data.events.map((e: { action: string }) => e.action)).toEqual(["create", "update"]);
    expect(history.data.events[1]).toMatchObject({ actorLabel: "Claude Code", via: "mcp" });

    const entries = await call(key.auth, "list_entries", { projectId: project.id });
    expect(entries.data.entries.length).toBeGreaterThanOrEqual(1);
  });

  it("returns tool errors (not transport errors) for bad input and other users' data", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const aliceKey = await createApiKey(alice.user.id);
    const bobKey = await createApiKey(bob.user.id);
    const t = await call(aliceKey.auth, "start_timer", {});

    const stolen = await call(bobKey.auth, "pause_timer", { timerId: t.data.timer.id });
    expect(stolen.isError).toBe(true);
    expect(stolen.text).toMatch(/not found/i);

    const future = await call(aliceKey.auth, "pause_timer", {
      timerId: t.data.timer.id,
      at: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(future.isError).toBe(true);
    expect(future.text).toMatch(/future/);
    expect(await prisma.timer.count({ where: { status: "running" } })).toBe(1);
  });

  it("requires auth and advertises Bearer", async () => {
    const res = await api()
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toMatch(/Bearer/);
    const { auth } = await createUser();
    expect((await api().get("/mcp").set(auth)).status).toBe(405);
  });
});
