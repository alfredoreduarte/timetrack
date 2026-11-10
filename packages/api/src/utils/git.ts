/**
 * Normalizes a git remote URL to `host/owner/repo` (lowercased, no scheme,
 * credentials, port, or `.git` suffix) so SSH and HTTPS clones of the same
 * repository compare equal — and so tokens embedded in URLs
 * (https://user:token@host/...) are never stored. Returns null for input
 * that doesn't look like a remote.
 *
 *   git@github.com:Acme/Web.git          -> github.com/acme/web
 *   https://tok@github.com/acme/web.git  -> github.com/acme/web
 *   ssh://git@gitlab.com:22/g/sub/r.git  -> gitlab.com/g/sub/r
 */
export function normalizeGitRemote(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || s.length > 500) return null;

  let host: string;
  let path: string;

  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(s);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      return null;
    }
    if (url.protocol === "file:") return null;
    host = url.hostname;
    path = url.pathname;
  } else if (scp) {
    host = scp[1];
    path = scp[2];
  } else {
    return null;
  }

  path = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  if (!host || !path || path.includes("..")) return null;
  s = `${host}/${path}`.toLowerCase();
  return /^[a-z0-9.-]+(\/[a-z0-9._~-]+)+$/.test(s) ? s : null;
}
