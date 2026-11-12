import { prisma } from "../../utils/database";
import { sweepIdleTimers } from "../../services/timers";
import { MAX_RUNNING_ENTRIES } from "../../services/limits";
import {
  normalizeRepoPattern,
  resolveProjectForRepo,
  learnRepoMapping,
} from "../../services/repos";
import { classifyAgentEvent } from "../../services/agentEvents";
import {
  api,
  resetDb,
  createUser,
  createApiKey,
  createProject,
  disconnect,
  serviceCtx,
} from "../../test/helpers";

beforeEach(resetDb);
afterAll(disconnect);

describe("repo patterns", () => {
  it("normalizes remotes and paths, rejects junk", () => {
    expect(normalizeRepoPattern("git@github.com:Acme/Web.git")).toBe("github.com/acme/web");
    expect(normalizeRepoPattern("github.com/Acme/Web")).toBe("github.com/acme/web");
    expect(normalizeRepoPattern("/Users/me/code/acme/")).toBe("/Users/me/code/acme");
    expect(normalizeRepoPattern("/Users/me/../etc")).toBeNull();
    expect(normalizeRepoPattern("nonsense")).toBeNull();
  });

  it("prefers an exact remote, then the longest path prefix, ignoring inactive projects", async () => {
    const { user } = await createUser();
    const web = await createProject(user.id, { name: "Web", repoPatterns: ["github.com/acme/web"] });
    const broad = await createProject(user.id, { name: "Broad", repoPatterns: ["/code"] });
    const deep = await createProject(user.id, { name: "Deep", repoPatterns: ["/code/acme"] });
    await createProject(user.id, { name: "Old", repoPatterns: ["github.com/acme/old"], isActive: false });

    expect((await resolveProjectForRepo(prisma, user.id, { gitRemote: "https://github.com/acme/web.git", cwd: "/code/acme/web" }))?.project.id).toBe(web.id);
    expect((await resolveProjectForRepo(prisma, user.id, { cwd: "/code/acme/api" }))?.project.id).toBe(deep.id);
    expect((await resolveProjectForRepo(prisma, user.id, { cwd: "/code/other" }))?.project.id).toBe(broad.id);
    // "/code" must not match "/codebase"
    expect(await resolveProjectForRepo(prisma, user.id, { cwd: "/codebase/x" })).toBeNull();
    expect(await resolveProjectForRepo(prisma, user.id, { gitRemote: "git@github.com:acme/old.git" })).toBeNull();
  });

  it("learns a mapping only when no other project claims the repo", async () => {
    const { user } = await createUser();
    const a = await createProject(user.id, { name: "A", repoPatterns: ["github.com/acme/a"] });
    const b = await createProject(user.id, { name: "B" });
    const ctx = serviceCtx(user.id);
    expect(await learnRepoMapping(prisma, ctx, b.id, { gitRemote: "git@github.com:acme/a.git" })).toBeNull();
    expect(await learnRepoMapping(prisma, ctx, b.id, { gitRemote: "git@github.com:acme/b.git" })).toBe("github.com/acme/b");
    const after = await prisma.project.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.repoPatterns).toEqual(["github.com/acme/b"]);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: a.id } })).repoPatterns).toEqual(["github.com/acme/a"]);
  });

  it("REST: create/update projects with repo patterns and resolve them", async () => {
    const { auth } = await createUser();
    const created = await api()
      .post("/projects")
      .set(auth)
      .send({ name: "Acme", repoPatterns: ["git@github.com:Acme/Web.git"] });
    expect(created.status).toBe(201);
    expect(created.body.project.repoPatterns).toEqual(["github.com/acme/web"]);
    const bad = await api().put(`/projects/${created.body.project.id}`).set(auth).send({ repoPatterns: ["???"] });
    expect(bad.status).toBe(400);
    const resolved = await api().post("/projects/resolve").set(auth).send({ gitRemote: "https://github.com/acme/web" });
    expect(resolved.body).toMatchObject({ project: { id: created.body.project.id }, matchedPattern: "github.com/acme/web" });
  });
});

describe("timers + repos", () => {
  it("auto-assigns the mapped project on start and learns on reassignment", async () => {
    const { user, auth } = await createUser();
    const acme = await createProject(user.id, { name: "Acme", hourlyRate: 140, repoPatterns: ["github.com/acme/web"] });
    const auto = await api().post("/timers").set(auth).send({ gitRemote: "git@github.com:acme/web.git" });
    expect(auto.body.timer.project).toMatchObject({ id: acme.id });
    expect(auto.body.matchedRepoPattern).toBe("github.com/acme/web");
    expect(auto.body.entry.hourlyRateSnapshot).toBe(140);

    const unmapped = await api().post("/timers").set(auth).send({ gitRemote: "git@github.com:globex/app.git" });
    expect(unmapped.body.timer.project).toBeNull();
    const globex = await createProject(user.id, { name: "Globex" });
    const assigned = await api().patch(`/timers/${unmapped.body.timer.id}`).set(auth).send({ projectId: globex.id });
    expect(assigned.body.learnedRepoPattern).toBe("github.com/globex/app");

    const next = await api().post("/timers").set(auth).send({ gitRemote: "https://github.com/globex/app" });
    expect(next.body.timer.project).toMatchObject({ id: globex.id });
  });
});

describe("POST /agent-events (hooks)", () => {
  const ccPayload = (event: string, extra: Record<string, unknown> = {}) => ({
    hook_event_name: event,
    session_id: "cc-123",
    cwd: "/Users/dev/acme-web",
    transcript_path: "/Users/dev/.claude/projects/x/cc-123.jsonl",
    ...extra,
  });

  it("classifies native and generic event names", () => {
    expect(classifyAgentEvent("SessionStart")).toBe("session_start");
    expect(classifyAgentEvent("session_end")).toBe("session_end");
    expect(classifyAgentEvent("PreToolUse")).toBe("activity");
    expect(classifyAgentEvent("Stop")).toBe("activity");
    expect(classifyAgentEvent("beforeSubmitPrompt")).toBe("activity");
    expect(classifyAgentEvent("Bogus")).toBeNull();
  });

  it("tracks a Claude Code session end-to-end from raw hook payloads", async () => {
    const { user } = await createUser({ agentIdleTimeoutSeconds: 600 });
    // Even a key not marked "AI by default": agent sessions are AI work.
    const key = await createApiKey(user.id, { aiByDefault: false });

    const start = await api()
      .post("/agent-events?format=claude-code")
      .set(key.auth)
      .send(ccPayload("SessionStart", { source: "startup", gitRemote: "git@github.com:acme/web.git", gitBranch: "main" }));
    expect(start.status).toBe(200);
    const ctxText: string = start.body.hookSpecificOutput.additionalContext;
    expect(start.body.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(ctxText).toMatch(/no project is set/);
    expect(ctxText).toContain("acme/web");

    const timer = await prisma.timer.findFirstOrThrow({ where: { sessionKey: "cc-123" } });
    expect(timer).toMatchObject({
      status: "running",
      agent: "claude_code",
      createdVia: "claude_code",
      isAiGenerated: true,
      idleTimeoutSeconds: 600,
      gitRemote: "github.com/acme/web",
      description: "Claude Code · acme/web (main)",
    });
    expect(ctxText).toContain(timer.id);

    // Prompts, tool payloads and assistant messages are ignored.
    const tool = await api()
      .post("/agent-events")
      .set(key.auth)
      .send(ccPayload("PreToolUse", { tool_name: "Bash", tool_input: { command: "cat secrets.env" } }));
    expect(tool.body).toMatchObject({ action: "touched", tracked: true });
    await api().post("/agent-events").set(key.auth).send(ccPayload("UserPromptSubmit", { prompt: "TOP SECRET PROMPT" }));
    const stopTurn = await api()
      .post("/agent-events")
      .set(key.auth)
      .send(ccPayload("Stop", { last_assistant_message: "TOP SECRET ANSWER" }));
    expect(stopTurn.body.timer.status).toBe("running"); // a turn ending is not the session ending

    // Give the segment some length so it isn't discarded as empty.
    await prisma.timeEntry.updateMany({
      where: { timerId: timer.id, isRunning: true },
      data: { startTime: new Date(Date.now() - 5 * 60_000) },
    });
    const end = await api().post("/agent-events").set(key.auth).send(ccPayload("SessionEnd", { reason: "exit" }));
    expect(end.body).toMatchObject({ action: "stopped" });
    const segment = await prisma.timeEntry.findFirstOrThrow({ where: { timerId: timer.id } });
    expect(segment.stopReason).toBe("session_end");

    const late = await api().post("/agent-events").set(key.auth).send(ccPayload("PostToolUse"));
    expect(late.body.action).toBe("ignored");

    const resumed = await api().post("/agent-events").set(key.auth).send(ccPayload("SessionStart", { source: "resume" }));
    expect(resumed.body).toMatchObject({ action: "resumed", tracked: true });
    expect(await prisma.timer.count()).toBe(1);

    // Nothing sensitive was persisted anywhere.
    const dump = JSON.stringify([
      await prisma.timer.findMany(),
      await prisma.timeEntry.findMany(),
      await prisma.auditEvent.findMany(),
    ]);
    expect(dump).not.toMatch(/TOP SECRET|secrets\.env|transcript/);
  });

  it("names the mapped project in the session context", async () => {
    const { user, auth } = await createUser();
    await createProject(user.id, { name: "Acme Web", repoPatterns: ["/Users/dev/acme-web"] });
    const start = await api().post("/agent-events?format=claude-code").set(auth).send(ccPayload("SessionStart"));
    expect(start.body.hookSpecificOutput.additionalContext).toContain('project named "Acme Web"');
  });

  it("creates the timer on first activity when hooks were installed mid-session", async () => {
    const { auth } = await createUser();
    const res = await api().post("/agent-events").set(auth).send(ccPayload("PostToolUse"));
    expect(res.body).toMatchObject({ action: "started", tracked: true });
    expect(res.body.context).toBeTruthy();
  });

  it("resumes an idle-paused session on the next activity", async () => {
    const { user } = await createUser({ agentIdleTimeoutSeconds: 300 });
    const key = await createApiKey(user.id);
    await api().post("/agent-events").set(key.auth).send(ccPayload("SessionStart"));
    const timer = await prisma.timer.findFirstOrThrow({ where: { sessionKey: "cc-123" } });
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    await prisma.timer.update({ where: { id: timer.id }, data: { lastActivityAt: tenMinAgo } });
    await prisma.timeEntry.updateMany({ where: { timerId: timer.id }, data: { startTime: new Date(Date.now() - 12 * 60_000) } });

    expect(await sweepIdleTimers(new Date())).toBe(1);
    const res = await api().post("/agent-events").set(key.auth).send(ccPayload("UserPromptSubmit"));
    expect(res.body).toMatchObject({ action: "resumed", tracked: true });
    const segs = await prisma.timeEntry.findMany({ where: { timerId: timer.id }, orderBy: { startTime: "asc" } });
    expect(segs).toHaveLength(2);
    expect(segs[0].endTime).toEqual(tenMinAgo);
  });

  it("recognizes Cursor payloads", async () => {
    const { auth } = await createUser();
    const res = await api()
      .post("/agent-events")
      .set(auth)
      .send({ hook_event_name: "beforeSubmitPrompt", conversation_id: "cur-1", workspace_roots: ["/w/proj"] });
    expect(res.body.action).toBe("started");
    const t = await prisma.timer.findFirstOrThrow({ where: { sessionKey: "cur-1" } });
    expect(t).toMatchObject({ agent: "cursor", createdVia: "cursor", cwd: "/w/proj" });
  });

  it("reports plan/concurrency limits without failing the hook", async () => {
    const { user, auth } = await createUser();
    await prisma.timeEntry.createMany({
      data: Array.from({ length: MAX_RUNNING_ENTRIES }, () => ({
        userId: user.id,
        startTime: new Date(),
        isRunning: true,
      })),
    });
    const res = await api().post("/agent-events?format=claude-code").set(auth).send(ccPayload("SessionStart"));
    expect(res.status).toBe(200);
    expect(res.body.hookSpecificOutput.additionalContext).toMatch(/NOT tracking/);
  });

  it("ignores unknown events and rejects missing session ids", async () => {
    const { auth } = await createUser();
    expect((await api().post("/agent-events").set(auth).send({ event: "Bogus", sessionKey: "x" })).body.action).toBe("ignored");
    expect((await api().post("/agent-events").set(auth).send({ hook_event_name: "SessionStart" })).status).toBe(400);
    expect((await api().post("/agent-events").send(ccPayload("SessionStart"))).status).toBe(401);
  });

  it("keeps other users' sessions separate even with the same session id", async () => {
    const alice = await createUser();
    const bob = await createUser();
    await api().post("/agent-events").set(alice.auth).send(ccPayload("SessionStart"));
    await api().post("/agent-events").set(bob.auth).send(ccPayload("SessionEnd"));
    const t = await prisma.timer.findFirstOrThrow({ where: { userId: alice.user.id } });
    expect(t.status).toBe("running");
  });
});
