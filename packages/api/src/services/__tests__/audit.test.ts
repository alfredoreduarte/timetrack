import { diffFields, recordAudit, listAuditEvents } from "../audit";
import { systemContext, ServiceContext } from "../context";
import { resetDb, createUser, disconnect } from "../../test/helpers";

describe("diffFields", () => {
  const fields = ["description", "startTime", "projectId"] as const;

  it("records only changed fields on update", () => {
    const before = { description: "a", startTime: new Date("2026-01-01T00:00:00Z"), projectId: "p1" };
    const after = { ...before, description: "b" };
    expect(diffFields(before, after, fields)).toEqual({ description: { from: "a", to: "b" } });
  });

  it("serializes dates and treats equal dates as unchanged", () => {
    const before = { description: null, startTime: new Date("2026-01-01T00:00:00Z"), projectId: null };
    const after = { ...before, startTime: new Date("2026-01-01T01:00:00Z") };
    expect(diffFields(before, after, fields)).toEqual({
      startTime: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-01T01:00:00.000Z" },
    });
    expect(diffFields(before, { ...before }, fields)).toBeNull();
  });

  it("captures non-empty fields on create and delete", () => {
    const snap = { description: "x", startTime: new Date("2026-01-01T00:00:00Z"), projectId: null };
    expect(diffFields(null, snap, fields)).toEqual({
      description: { from: null, to: "x" },
      startTime: { from: null, to: "2026-01-01T00:00:00.000Z" },
    });
    expect(diffFields(snap, null, fields)).toEqual({
      description: { from: "x", to: null },
      startTime: { from: "2026-01-01T00:00:00.000Z", to: null },
    });
  });
});

describe("recordAudit / listAuditEvents", () => {
  beforeEach(resetDb);
  afterAll(disconnect);

  it("persists actor metadata and returns events oldest first, scoped to the user", async () => {
    const { user } = await createUser();
    const other = await createUser();
    const { prisma } = await import("../../utils/database");

    const keyCtx: ServiceContext = {
      ...systemContext(user.id),
      actorType: "api_key",
      actorId: "key_1",
      actorLabel: "Claude Code",
      via: "mcp",
      now: () => new Date("2026-03-01T10:00:00Z"),
    };
    await recordAudit(prisma, keyCtx, {
      entityType: "time_entry",
      entityId: "e1",
      action: "update",
      changes: { description: { from: "a", to: "b" } },
    });
    await recordAudit(prisma, systemContext(user.id, () => new Date("2026-03-01T11:00:00Z")), {
      entityType: "time_entry",
      entityId: "e1",
      action: "auto_pause",
    });
    await recordAudit(prisma, systemContext(other.user.id), {
      entityType: "time_entry",
      entityId: "e1",
      action: "create",
    });

    const events = await listAuditEvents(systemContext(user.id), "time_entry", "e1");
    expect(events.map((e) => e.action)).toEqual(["update", "auto_pause"]);
    expect(events[0]).toMatchObject({
      actorType: "api_key",
      actorLabel: "Claude Code",
      via: "mcp",
      changes: { description: { from: "a", to: "b" } },
    });
    expect(events[1]).toMatchObject({ actorType: "system", changes: null });
  });
});
