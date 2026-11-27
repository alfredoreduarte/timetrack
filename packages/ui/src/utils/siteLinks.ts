/**
 * The marketing site that hosts the Terms and Privacy Policy. It lives on
 * the app's domain without the "app." label (app.track.example → track.example);
 * in local dev the landing runs on 5174 (Vite), or on 3014 when the app is
 * served by the Docker dev stack on 3010.
 */
export function landingUrl(loc: Pick<Location, "protocol" | "hostname" | "port"> = window.location): string {
  const { protocol, hostname, port } = loc;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return port === "3010" ? "http://localhost:3014" : "http://localhost:5174";
  }
  if (hostname.startsWith("app.")) return `${protocol}//${hostname.slice(4)}`;
  return `${protocol}//${hostname}`;
}
