import { prisma, TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { normalizeGitRemote } from "../utils/git";
import { ServiceContext } from "./context";
import { recordAudit } from "./audit";

type Db = TxClient | typeof prisma;

export const MAX_REPO_PATTERNS = 50;

/**
 * Normalizes one repo pattern. Absolute paths (`/Users/me/code/acme`) become
 * path prefixes; anything else must be a git remote (any URL form, or an
 * already-normalized `host/owner/repo`). Returns null if invalid.
 */
export function normalizeRepoPattern(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 500) return null;
  if (value.startsWith("/")) {
    if (value.includes("\0") || /(^|\/)\.\.(\/|$)/.test(value)) return null;
    const trimmed = value.replace(/\/+$/, "");
    return trimmed || null;
  }
  return normalizeGitRemote(value);
}

export function normalizeRepoPatterns(patterns: string[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    const n = normalizeRepoPattern(p);
    if (!n) throw createError(`Invalid repo pattern: ${p.slice(0, 80)}`, 400);
    if (!out.includes(n)) out.push(n);
  }
  if (out.length > MAX_REPO_PATTERNS) {
    throw createError(`A project can have at most ${MAX_REPO_PATTERNS} repo patterns`, 400);
  }
  return out;
}

const isPathPattern = (p: string) => p.startsWith("/");

export interface RepoMatch {
  project: { id: string; name: string; color: string };
  pattern: string;
}

/**
 * Finds the project a repository belongs to: an exact git-remote match wins,
 * then the longest matching path prefix. Inactive projects are ignored.
 */
export async function resolveProjectForRepo(
  db: Db,
  userId: string,
  repo: { gitRemote?: string | null; cwd?: string | null }
): Promise<RepoMatch | null> {
  const remote = normalizeGitRemote(repo.gitRemote) ?? null;
  const cwd = repo.cwd?.replace(/\/+$/, "") || null;
  if (!remote && !cwd) return null;

  const projects = await db.project.findMany({
    where: { userId, isActive: true, NOT: { repoPatterns: { isEmpty: true } } },
    select: { id: true, name: true, color: true, repoPatterns: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  if (remote) {
    const hit = projects.find((p) => p.repoPatterns.includes(remote));
    if (hit) return { project: { id: hit.id, name: hit.name, color: hit.color }, pattern: remote };
  }
  if (cwd) {
    let best: RepoMatch | null = null;
    for (const p of projects) {
      for (const pattern of p.repoPatterns) {
        if (!isPathPattern(pattern)) continue;
        if (cwd === pattern || cwd.startsWith(`${pattern}/`)) {
          if (!best || pattern.length > best.pattern.length) {
            best = { project: { id: p.id, name: p.name, color: p.color }, pattern };
          }
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Remembers that a repository belongs to a project, so future agent sessions
 * there are assigned automatically. Only claims repos no other project of
 * the user claims. Prefers the git remote (stable across worktrees and
 * machines); falls back to the working directory.
 */
export async function learnRepoMapping(
  db: Db,
  ctx: ServiceContext,
  projectId: string,
  repo: { gitRemote?: string | null; cwd?: string | null }
): Promise<string | null> {
  const pattern =
    normalizeGitRemote(repo.gitRemote) ?? (repo.cwd ? normalizeRepoPattern(repo.cwd) : null);
  if (!pattern) return null;

  const claimed = await db.project.findFirst({
    where: { userId: ctx.userId, repoPatterns: { has: pattern } },
    select: { id: true },
  });
  if (claimed) return null;

  const project = await db.project.findFirst({
    where: { id: projectId, userId: ctx.userId },
    select: { id: true, repoPatterns: true },
  });
  if (!project || project.repoPatterns.length >= MAX_REPO_PATTERNS) return null;

  await db.project.update({
    where: { id: project.id },
    data: { repoPatterns: { push: pattern } },
  });
  await recordAudit(db, ctx, {
    entityType: "project",
    entityId: project.id,
    action: "learn_repo",
    changes: { repoPatterns: { from: null, to: pattern } },
  });
  return pattern;
}

/** Short human label for a repo: `acme/web` from a remote, else the folder name. */
export function repoLabel(repo: { gitRemote?: string | null; cwd?: string | null }): string | null {
  const remote = normalizeGitRemote(repo.gitRemote);
  if (remote) return remote.split("/").slice(-2).join("/");
  const cwd = repo.cwd?.replace(/\/+$/, "");
  if (cwd) return cwd.split("/").pop() || null;
  return null;
}
