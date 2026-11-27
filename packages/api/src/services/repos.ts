import { prisma, TxClient } from "../utils/database";
import { createError } from "../middleware/errorHandler";
import { normalizeGitRemote } from "../utils/git";
import { ServiceContext } from "./context";
import { recordAudit } from "./audit";

type Db = TxClient | typeof prisma;

export const MAX_REPO_PATTERNS = 50;
const REPO_LOCK_SPACE = 7;

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
 * there are assigned automatically. Only git remotes are learned: they are
 * stable across worktrees and machines, and they name one repository. A
 * folder can mean anything (a home directory, ~/Developer, a client folder
 * of many repos), so folder prefixes are only ever added by the user.
 *
 * Skips a remote another active project already claims exactly —
 * reassigning one session isn't a request to move them all. A folder
 * prefix doesn't count as a claim: learning the remote is how a
 * reassignment corrects a session that a broad prefix misrouted (an exact
 * remote beats a prefix).
 */
export async function learnRepoMapping(
  db: Db,
  ctx: ServiceContext,
  projectId: string,
  repo: { gitRemote?: string | null; cwd?: string | null }
): Promise<string | null> {
  const pattern = normalizeGitRemote(repo.gitRemote);
  if (!pattern) return null;

  // Serializes concurrent learns for this user (held until the caller's
  // transaction ends), so two assignments can't both claim the repo. The
  // two-key form keeps it apart from the running-timer cap's lock.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${REPO_LOCK_SPACE}::int, hashtext(${ctx.userId}))`;
  const claimed = await db.project.findFirst({
    where: { userId: ctx.userId, isActive: true, repoPatterns: { has: pattern } },
    select: { id: true },
  });
  if (claimed) return null;

  const project = await db.project.findFirst({
    where: { id: projectId, userId: ctx.userId },
    select: { id: true, repoPatterns: true },
  });
  if (!project || project.repoPatterns.length >= MAX_REPO_PATTERNS) return null;

  const added = await db.$executeRaw`
    UPDATE projects SET repo_patterns = array_append(repo_patterns, ${pattern}), "updatedAt" = now()
    WHERE id = ${project.id} AND NOT (${pattern} = ANY(repo_patterns))`;
  if (added === 0) return null;
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
