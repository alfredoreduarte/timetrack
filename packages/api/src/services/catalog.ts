import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { emitToUser } from "../realtime";
import { ServiceContext } from "./context";
import { cleanText } from "./text";
import { normalizeRepoPatterns } from "./repos";

// Projects and tasks, shared by the REST routes and the MCP endpoint.

const COLOR_RE = /^#[0-9A-F]{6}$/i;

export const projectSelect = {
  id: true,
  name: true,
  description: true,
  color: true,
  hourlyRate: true,
  isActive: true,
  repoPatterns: true,
  overlapMode: true,
  aiMultiplier: true,
  agentHourlyRate: true,
  includeAiCosts: true,
  aiCostMarkupPercent: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

export const taskSelect = {
  id: true,
  name: true,
  description: true,
  isCompleted: true,
  hourlyRate: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TaskSelect;

const checkRate = (rate: number | null | undefined) => {
  if (rate === undefined || rate === null) return rate;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100_000) {
    throw createError("hourlyRate must be a number between 0 and 100000", 400);
  }
  return rate;
};

const checkColor = (color: string | undefined) => {
  if (color === undefined) return undefined;
  if (!COLOR_RE.test(color)) throw createError("Invalid color format", 400);
  return color;
};

const requireName = (name: string | null | undefined, what: string) => {
  const cleaned = cleanText(name, "name", 200);
  if (!cleaned) throw createError(`${what} name is required`, 400);
  return cleaned;
};

export async function listProjects(ctx: ServiceContext, opts: { isActive?: boolean } = {}) {
  return prisma.project.findMany({
    where: { userId: ctx.userId, ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}) },
    select: { ...projectSelect, _count: { select: { tasks: true, timeEntries: true } } },
    orderBy: { createdAt: "desc" },
  });
}

const sameRate = (next: number | null, stored: { toString(): string } | number | null) =>
  next === null ? stored === null : stored !== null && Number(stored.toString()) === next;

export interface ProjectInput {
  name?: string;
  description?: string | null;
  color?: string;
  hourlyRate?: number | null;
  isActive?: boolean;
  repoPatterns?: string[];
  // Billing policy (null = inherit from the user)
  overlapMode?: "dedupe" | "sum" | null;
  aiMultiplier?: number | null;
  agentHourlyRate?: number | null;
  includeAiCosts?: boolean;
  aiCostMarkupPercent?: number;
}

const checkOverlap = (v: string | null | undefined) => {
  if (v === undefined || v === null) return v;
  if (v !== "dedupe" && v !== "sum") throw createError('overlapMode must be "dedupe" or "sum"', 400);
  return v;
};

const checkRange = (v: number | null | undefined, field: string, min: number, max: number) => {
  if (v === undefined || v === null) return v;
  if (!Number.isFinite(v) || v < min || v > max) {
    throw createError(`${field} must be between ${min} and ${max}`, 400);
  }
  return v;
};

/** Validated billing-policy fields present in the input. */
type PolicyFields = {
  overlapMode?: string | null;
  aiMultiplier?: number | null;
  agentHourlyRate?: number | null;
  includeAiCosts?: boolean;
  aiCostMarkupPercent?: number;
};

const policyData = (input: ProjectInput): PolicyFields => {
  const data: PolicyFields = {};
  if (input.overlapMode !== undefined) data.overlapMode = checkOverlap(input.overlapMode);
  if (input.aiMultiplier !== undefined) data.aiMultiplier = checkRange(input.aiMultiplier, "aiMultiplier", 0, 20);
  if (input.agentHourlyRate !== undefined) data.agentHourlyRate = checkRate(input.agentHourlyRate);
  if (input.includeAiCosts !== undefined) data.includeAiCosts = input.includeAiCosts;
  if (input.aiCostMarkupPercent !== undefined) {
    data.aiCostMarkupPercent = checkRange(input.aiCostMarkupPercent, "aiCostMarkupPercent", 0, 100) ?? 0;
  }
  return data;
};

export async function createProject(ctx: ServiceContext, input: ProjectInput) {
  const project = await prisma.project.create({
    data: {
      userId: ctx.userId,
      name: requireName(input.name, "Project"),
      description: cleanText(input.description, "description", 2000) ?? null,
      color: checkColor(input.color) ?? "#3B82F6",
      hourlyRate: checkRate(input.hourlyRate) ?? null,
      repoPatterns: input.repoPatterns ? normalizeRepoPatterns(input.repoPatterns) : [],
      ...policyData(input),
    },
    select: projectSelect,
  });
  emitToUser(ctx.userId, "project-created", project);
  return project;
}

export async function updateProject(ctx: ServiceContext, id: string, input: ProjectInput) {
  const existing = await prisma.project.findFirst({
    where: { id, userId: ctx.userId },
    select: { id: true, name: true, description: true, hourlyRate: true },
  });
  if (!existing) throw createError("Project not found", 404);

  // Clients resend every field on save; values that predate the length and
  // rate caps stay editable as long as they aren't changed.
  const data: Prisma.ProjectUpdateInput = {};
  if (input.name !== undefined && input.name !== existing.name) data.name = requireName(input.name, "Project");
  if (input.description !== undefined && input.description !== existing.description) {
    data.description = cleanText(input.description, "description", 2000) ?? null;
  }
  if (input.color !== undefined) data.color = checkColor(input.color);
  if (input.hourlyRate !== undefined && !sameRate(input.hourlyRate, existing.hourlyRate)) {
    data.hourlyRate = checkRate(input.hourlyRate);
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.repoPatterns !== undefined) data.repoPatterns = normalizeRepoPatterns(input.repoPatterns);
  Object.assign(data, policyData(input));

  const project = await prisma.project.update({ where: { id }, data, select: projectSelect });
  emitToUser(ctx.userId, "project-updated", project);
  return project;
}

export async function listTasks(
  ctx: ServiceContext,
  opts: { projectId?: string; isCompleted?: boolean } = {}
) {
  return prisma.task.findMany({
    where: {
      userId: ctx.userId,
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
      ...(opts.isCompleted !== undefined ? { isCompleted: opts.isCompleted } : {}),
    },
    select: { ...taskSelect, _count: { select: { timeEntries: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export interface TaskInput {
  name?: string;
  description?: string | null;
  projectId?: string;
  hourlyRate?: number | null;
  isCompleted?: boolean;
}

export async function createTask(ctx: ServiceContext, input: TaskInput) {
  if (!input.projectId) throw createError("projectId is required", 400);
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: ctx.userId },
    select: { id: true },
  });
  if (!project) throw createError("Project not found", 404);

  const task = await prisma.task.create({
    data: {
      userId: ctx.userId,
      projectId: project.id,
      name: requireName(input.name, "Task"),
      description: cleanText(input.description, "description", 2000) ?? null,
      hourlyRate: checkRate(input.hourlyRate) ?? null,
    },
    select: taskSelect,
  });
  emitToUser(ctx.userId, "task-created", task);
  return task;
}

export async function updateTask(ctx: ServiceContext, id: string, input: TaskInput) {
  const existing = await prisma.task.findFirst({
    where: { id, userId: ctx.userId },
    select: { id: true, name: true, description: true, hourlyRate: true },
  });
  if (!existing) throw createError("Task not found", 404);

  const data: Prisma.TaskUpdateInput = {};
  if (input.name !== undefined && input.name !== existing.name) data.name = requireName(input.name, "Task");
  if (input.description !== undefined && input.description !== existing.description) {
    data.description = cleanText(input.description, "description", 2000) ?? null;
  }
  if (input.hourlyRate !== undefined && !sameRate(input.hourlyRate, existing.hourlyRate)) {
    data.hourlyRate = checkRate(input.hourlyRate);
  }
  if (input.isCompleted !== undefined) data.isCompleted = input.isCompleted;

  const task = await prisma.task.update({ where: { id }, data, select: taskSelect });
  emitToUser(ctx.userId, "task-updated", task);
  return task;
}
