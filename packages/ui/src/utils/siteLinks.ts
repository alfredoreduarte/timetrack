/**
 * The marketing site that hosts the Terms and Privacy Policy. It lives on
 * the app's domain without the "app." label (app.track.example → track.example);
 * in local dev the landing runs on port 5174.
 */
export function landingUrl(loc: Pick<Location, "protocol" | "hostname"> = window.location): string {
  const { protocol, hostname } = loc;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:5174";
  if (hostname.startsWith("app.")) return `${protocol}//${hostname.slice(4)}`;
  return `${protocol}//${hostname}`;
}
