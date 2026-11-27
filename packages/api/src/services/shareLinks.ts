import crypto from "crypto";
import { prisma } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { ServiceContext } from "./context";
import { recordAudit } from "./audit";
import { cleanText } from "./text";
import { buildTimesheet, redactTimesheet, resolveTimezone, Timesheet, MAX_TIMESHEET_DAYS } from "./timesheets";
import { getEntitlements, planLimitError } from "./entitlements";

export const SHARE_TOKEN_PREFIX = "ts_";

/** Shape check only: a token failing it can't belong to any link. */
export const isPlausibleShareToken = (token: string) => token.startsWith(SHARE_TOKEN_PREFIX) && token.length <= 100;
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
  const { limits } = await getEntitlements(ctx.userId, prisma, ctx.now());
  if (!limits.shareLinks) throw planLimitError("Client share links are a Pro feature.");
  const timezone = resolveTimezone(input.timezone);
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
  // A link nobody can open is a bug report waiting to happen.
  if (startDate && startDate >= now) throw createError("startDate must be in the past", 400);
  if (startDate && endDate && endDate.getTime() - startDate.getTime() > MAX_TIMESHEET_DAYS * 86400 * 1000) {
    throw createError(`A shared period can cover at most ${MAX_TIMESHEET_DAYS} days`, 400);
  }

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
      apiKeyId: ctx.actorType === "api_key" ? ctx.actorId : null,
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
  link: { expiresAt: Date | null; showAmounts: boolean };
  timesheet: Timesheet;
}

// Concurrent views of one link share one build. Nothing is kept once it
// settles: builds are cheap (O(n log n)), the route is rate limited, and a
// retained copy per link would be memory anyone with links could fill.
const inFlight = new Map<string, Promise<Timesheet>>();

/**
 * Resolves a share token to the client view of the timesheet. Unknown,
 * revoked and expired tokens — and links whose API key was revoked — all
 * look the same (404).
 */
export async function getPublicTimesheet(token: string, now = new Date()): Promise<PublicTimesheet> {
  if (!isPlausibleShareToken(token)) throw createError("Not found", 404);
  const link = await prisma.shareLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt <= now)) {
    throw createError("Not found", 404);
  }
  // Links pause while the owner's plan doesn't include them (e.g. after a
  // trial ends) and work again after an upgrade.
  const { limits } = await getEntitlements(link.userId, prisma, now);
  if (!limits.shareLinks) throw createError("Not found", 404);
  if (link.apiKeyId) {
    const key = await prisma.apiKey.findUnique({
      where: { id: link.apiKeyId },
      select: { isActive: true, expiresAt: true },
    });
    if (!key || !key.isActive || (key.expiresAt && key.expiresAt <= now)) throw createError("Not found", 404);
  }

  let build = inFlight.get(link.id);
  if (!build) {
    const maxSpanStart = new Date(now.getTime() - MAX_TIMESHEET_DAYS * 86400 * 1000 + 60_000);
    let startDate = link.rollingDays
      ? new Date(now.getTime() - link.rollingDays * 86400 * 1000)
      : link.startDate ?? maxSpanStart;
    const endDate = link.rollingDays ? now : link.endDate && link.endDate < now ? link.endDate : now;
    // An open-ended link keeps showing the most recent year once it is older.
    if (!link.endDate && startDate < maxSpanStart) startDate = maxSpanStart;

    build = buildTimesheet(
      link.userId,
      { startDate, endDate, projectId: link.projectId ?? undefined, timezone: link.timezone },
      { now, showNotes: link.showNotes }
    )
      .then((sheet) => redactTimesheet(sheet, { showAmounts: link.showAmounts, showNotes: link.showNotes }))
      .finally(() => inFlight.delete(link.id));
    inFlight.set(link.id, build);
  }
  const timesheet = await build;

  await prisma.shareLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: now },
  });
  return {
    // The link's name is the owner's private label: never public.
    link: { expiresAt: link.expiresAt, showAmounts: link.showAmounts },
    timesheet,
  };
}
