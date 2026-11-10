import crypto from "crypto";
import { prisma } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { ServiceContext } from "./context";
import { recordAudit } from "./audit";
import { cleanText } from "./text";
import { isValidTimezone } from "../billing/time";
import { buildTimesheet, redactTimesheet, Timesheet, MAX_TIMESHEET_DAYS } from "./timesheets";

export const SHARE_TOKEN_PREFIX = "ts_";
export const MAX_SHARE_LINKS = 100;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const shareLinkSelect = {
  id: true,
  name: true,
  tokenPrefix: true,
  projectId: true,
  project: { select: { id: true, name: true } },
  startDate: true,
  endDate: true,
  rollingDays: true,
  timezone: true,
  showAmounts: true,
  showNotes: true,
  expiresAt: true,
  revokedAt: true,
  lastViewedAt: true,
  viewCount: true,
  createdAt: true,
} as const;

export interface CreateShareLinkInput {
  name?: string | null;
  projectId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  rollingDays?: number | null;
  timezone?: string | null;
  showAmounts?: boolean;
  showNotes?: boolean;
  expiresAt?: string | null;
}

export const shareUrl = (token: string) =>
  `${(process.env.APPLICATION_URL || "http://localhost:3010").replace(/\/$/, "")}/share/${token}`;

export async function createShareLink(ctx: ServiceContext, input: CreateShareLinkInput) {
  const timezone = input.timezone || "UTC";
  if (!isValidTimezone(timezone)) throw createError("Invalid timezone", 400);
  const now = ctx.now();
  const startDate = input.startDate ? new Date(input.startDate) : null;
  const endDate = input.endDate ? new Date(input.endDate) : null;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  for (const [name, d] of [["startDate", startDate], ["endDate", endDate], ["expiresAt", expiresAt]] as const) {
    if (d && Number.isNaN(d.getTime())) throw createError(`${name} must be an ISO 8601 timestamp`, 400);
  }
  if (expiresAt && expiresAt <= now) throw createError("expiresAt must be in the future", 400);

  const rolling = input.rollingDays ?? null;
  if (rolling !== null && (!Number.isInteger(rolling) || rolling < 1 || rolling > MAX_TIMESHEET_DAYS)) {
    throw createError(`rollingDays must be between 1 and ${MAX_TIMESHEET_DAYS}`, 400);
  }
  if (rolling !== null && (startDate || endDate)) {
    throw createError("Use either rollingDays or a startDate/endDate range, not both", 400);
  }
  if (rolling === null && !startDate) throw createError("Provide startDate (and optionally endDate) or rollingDays", 400);
  if (startDate && endDate && endDate <= startDate) throw createError("endDate must be after startDate", 400);

  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, userId: ctx.userId },
      select: { id: true },
    });
    if (!project) throw createError("Project not found", 404);
  }
  const active = await prisma.shareLink.count({ where: { userId: ctx.userId, revokedAt: null } });
  if (active >= MAX_SHARE_LINKS) throw createError(`At most ${MAX_SHARE_LINKS} active share links`, 400);

  const token = `${SHARE_TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  const link = await prisma.shareLink.create({
    data: {
      userId: ctx.userId,
      name: cleanText(input.name, "name", 200) ?? null,
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, SHARE_TOKEN_PREFIX.length + 8),
      projectId: input.projectId ?? null,
      startDate,
      endDate,
      rollingDays: rolling,
      timezone,
      showAmounts: input.showAmounts ?? true,
      showNotes: input.showNotes ?? true,
      expiresAt,
    },
    select: shareLinkSelect,
  });
  await recordAudit(prisma, ctx, { entityType: "share_link", entityId: link.id, action: "create" });
  // The token is only ever returned here.
  return { shareLink: link, token, url: shareUrl(token) };
}

export async function listShareLinks(ctx: ServiceContext) {
  return prisma.shareLink.findMany({
    where: { userId: ctx.userId },
    select: shareLinkSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeShareLink(ctx: ServiceContext, id: string) {
  const link = await prisma.shareLink.findFirst({ where: { id, userId: ctx.userId }, select: { id: true, revokedAt: true } });
  if (!link) throw createError("Share link not found", 404);
  if (!link.revokedAt) {
    await prisma.shareLink.update({ where: { id }, data: { revokedAt: ctx.now() } });
    await recordAudit(prisma, ctx, { entityType: "share_link", entityId: id, action: "revoke" });
  }
}

export interface PublicTimesheet {
  link: { name: string | null; expiresAt: Date | null; showAmounts: boolean };
  timesheet: Timesheet;
}

/**
 * Resolves a share token to the client view of the timesheet. Unknown,
 * revoked and expired tokens all look the same (404).
 */
export async function getPublicTimesheet(token: string, now = new Date()): Promise<PublicTimesheet> {
  if (!token.startsWith(SHARE_TOKEN_PREFIX) || token.length > 100) throw createError("Not found", 404);
  const link = await prisma.shareLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt <= now)) {
    throw createError("Not found", 404);
  }
  const startDate = link.rollingDays
    ? new Date(now.getTime() - link.rollingDays * 86400 * 1000)
    : link.startDate ?? undefined;
  const endDate = link.rollingDays ? now : link.endDate ?? now;

  const sheet = await buildTimesheet(
    link.userId,
    { startDate, endDate: endDate > now ? now : endDate, projectId: link.projectId ?? undefined, timezone: link.timezone },
    { now, showNotes: link.showNotes }
  );
  const redacted = redactTimesheet(sheet, { showAmounts: link.showAmounts, showNotes: link.showNotes });
  // Strip internal identifiers from the public view.
  redacted.projects = redacted.projects.map((p) => ({
    ...p,
    project: p.project ? { ...p.project, id: "" } : null,
    lines: p.lines.map((l) => ({ ...l, timerId: null, entryIds: [] })),
    costs: p.costs.map((c) => ({ ...c, timerId: "" })),
  }));

  await prisma.shareLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: now },
  });
  return {
    link: { name: link.name, expiresAt: link.expiresAt, showAmounts: link.showAmounts },
    timesheet: redacted,
  };
}
