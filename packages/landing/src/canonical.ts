/**
 * Where a path with trailing slashes should redirect, or null when it's
 * already canonical: "/terms/" → "/terms".
 *
 * The target is always a path on this site. Leading slashes and backslashes
 * collapse to one, so "//evil.example/x/" can't become a protocol-relative
 * redirect to another host. Loops, not regexes, so long runs of slashes
 * stay linear.
 */
export function canonicalRedirect(pathname: string): string | null {
  if (pathname.length <= 1 || !pathname.endsWith("/")) return null;
  let start = 0;
  while (start < pathname.length && (pathname[start] === "/" || pathname[start] === "\\")) start++;
  let end = pathname.length;
  while (end > start && pathname[end - 1] === "/") end--;
  return "/" + pathname.slice(start, end);
}
