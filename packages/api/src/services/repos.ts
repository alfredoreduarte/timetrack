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

// Folders that hold many unrelated repos; learning one would send every
// session beneath it to the same client.
const CONTAINER_DIRS = new Set([
  "code", "dev", "src", "source", "projects", "work", "workspace", "workspaces", "repos", "git",
  "github", "gitlab", "documents", "desktop", "downloads", "sites", "clients", "tmp", "temp",
]);

/**
 * Whether a working directory is specific enough to learn as a path
 * prefix: never a home directory, a top-level folder, a temp directory or a
 * generic container like ~/dev.
 */
export function isLearnablePath(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (["tmp", "private", "var", "proc", "dev", "sys"].includes(parts[0].toLowerCase())) return false;
  const homeDepth = parts[0] === "Users" || parts[0] === "home" ? 2 : parts[0] === "root" ? 1 : 0;
  const below = parts.slice(homeDepth);
  if (below.length === 0) return false;
  if (below.length === 1 && CONTAINER_DIRS.has(below[0].toLowerCase())) return false;
  // Outside a home directory a single segment (/workspace, /srv) is too broad.
  if (homeDepth === 0 && below.length < 2) return false;
  return true;
}

/**
 * Remembers that a repository belongs to a project, so future agent sessions
 * there are assigned automatically. Learns the git remote (stable across
 * worktrees and machines); a folder only when there is no remote and it is
 * specific (see isLearnablePath). Never claims a repo that already resolves
 * to a project — reassigning one session isn't a request to move them all.
 */
export async function learnRepoMapping(
  db: Db,
  ctx: ServiceContext,
  projectId: string,
  repo: { gitRemote?: string | null; cwd?: string | null }
): Promise<string | null> {
  const remote = normalizeGitRemote(repo.gitRemote);
  const folder = !remote && repo.cwd ? normalizeRepoPattern(repo.cwd) : null;
  const pattern = remote ?? (folder && isPathPattern(folder) && isLearnablePath(folder) ? folder : null);
  if (!pattern) return null;

  // Serializes concurrent learns for this user (held until the caller's
  // transaction ends), so two assignments can't both claim the repo. The
  // two-key form keeps it apart from the running-timer cap's lock.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${REPO_LOCK_SPACE}::int, hashtext(${ctx.userId}))`;
  if (await resolveProjectForRepo(db, ctx.userId, { gitRemote: remote, cwd: repo.cwd })) {
    return null;
  }

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
