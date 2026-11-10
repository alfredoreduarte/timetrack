import { Prisma } from "@prisma/client";
import { prisma, TxClient } from "../utils/database";
import { ServiceContext } from "./context";

type Db = TxClient | typeof prisma;

export type AuditEntityType = "time_entry" | "timer" | "project" | "share_link";

export type FieldChange = { from: unknown; to: unknown };
export type AuditChanges = Record<string, FieldChange>;

const toJsonValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
};

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(toJsonValue(a)) === JSON.stringify(toJsonValue(b));

/**
 * Field-level diff between two snapshots, restricted to `fields`. Pass
 * `before = null` for creations and `after = null` for deletions so every
 * listed field is recorded. Returns null when nothing changed.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T | null,
  after: T | null,
  fields: ReadonlyArray<keyof T & string>
): AuditChanges | null {
  const changes: AuditChanges = {};
  for (const field of fields) {
    const from = before ? before[field] : null;
    const to = after ? after[field] : null;
    if (before && after && same(from, to)) continue;
    if (!before && (to === null || to === undefined)) continue;
    if (!after && (from === null || from === undefined)) continue;
    changes[field] = { from: toJsonValue(from), to: toJsonValue(to) };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export interface AuditInput {
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  changes?: AuditChanges | null;
}

export async function recordAudit(
  db: Db,
  ctx: ServiceContext,
  input: AuditInput
): Promise<void> {
  await db.auditEvent.create({
    data: {
      userId: ctx.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorType: ctx.actorType,
      actorId: ctx.actorId,
      actorLabel: ctx.actorLabel,
      via: ctx.via,
      changes: (input.changes ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt: ctx.now(),
    },
  });
}

export const auditEventSelect = {
  id: true,
  entityType: true,
  entityId: true,
  action: true,
  actorType: true,
  actorLabel: true,
  via: true,
  changes: true,
  createdAt: true,
} as const;

export async function listAuditEvents(
  ctx: ServiceContext,
  entityType: AuditEntityType,
  entityId: string
) {
  return prisma.auditEvent.findMany({
    where: { userId: ctx.userId, entityType, entityId },
    orderBy: { createdAt: "asc" },
    select: auditEventSelect,
  });
}
