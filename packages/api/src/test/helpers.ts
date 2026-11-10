import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { createApp } from "../app";
import { prisma } from "../utils/database";
import { generateApiKey } from "../utils/apiKeys";

let app: Express | undefined;

/** One app instance per test file; routes are stateless across tests. */
export const getApp = (): Express => {
  if (!app) app = createApp().app;
  return app;
};

export const api = () => request(getApp());

/** Empties every application table (keeps the migrations ledger). */
export async function resetDb(): Promise<void> {
  const rows: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

let userCounter = 0;

export interface TestUser {
  user: { id: string; email: string; name: string };
  token: string;
  auth: { Authorization: string };
}

export async function createUser(
  overrides: Record<string, unknown> = {}
): Promise<TestUser> {
  userCounter += 1;
  const user = await prisma.user.create({
    data: {
      email: `user${userCounter}-${Date.now()}@test.dev`,
      name: `Test User ${userCounter}`,
      password: "not-a-real-hash",
      defaultHourlyRate: 100,
      ...overrides,
    },
  });
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createApiKey(
  userId: string,
  opts: { name?: string; aiByDefault?: boolean } = {}
): Promise<{ id: string; token: string; auth: { Authorization: string } }> {
  const key = generateApiKey();
  const row = await prisma.apiKey.create({
    data: {
      name: opts.name ?? "Test agent key",
      keyHash: key.hash,
      keyPrefix: key.prefix,
      userId,
      aiByDefault: opts.aiByDefault ?? true,
    },
  });
  return {
    id: row.id,
    token: key.token,
    auth: { Authorization: `Bearer ${key.token}` },
  };
}

export async function createProject(
  userId: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.project.create({
    data: { name: "Client Project", userId, ...overrides },
  });
}

export async function createTask(
  userId: string,
  projectId: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.task.create({
    data: { name: "Task", userId, projectId, ...overrides },
  });
}

export const disconnect = () => prisma.$disconnect();

/** A controllable clock for service-level tests. */
export function testClock(startIso = "2026-03-02T09:00:00.000Z") {
  let t = new Date(startIso).getTime();
  return {
    now: () => new Date(t),
    set: (iso: string) => {
      t = new Date(iso).getTime();
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

export function serviceCtx(
  userId: string,
  overrides: Partial<import("../services/context").ServiceContext> = {}
): import("../services/context").ServiceContext {
  return {
    userId,
    actorType: "api_key",
    actorId: "test-key",
    actorLabel: "Test agent",
    via: "mcp",
    aiDefault: true,
    now: () => new Date(),
    ...overrides,
  };
}

export const MIN = 60_000;
