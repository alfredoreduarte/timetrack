import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// The web app is served by packages/ui/nginx.conf; its CSP decides whether the
// browser may open the Socket.IO websocket to the API (a different subdomain).
const conf = readFileSync(resolve(__dirname, "../../nginx.conf"), "utf8");
const csp = /add_header Content-Security-Policy "([^"]+)"/.exec(conf)?.[1] ?? "";
const directive = (name: string) =>
  csp
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === name)
    ?.slice(1) ?? [];

describe("web app CSP", () => {
  it("lets the live board open its websocket", () => {
    expect(directive("connect-src")).toEqual(expect.arrayContaining(["wss:", "https:"]));
  });

  it("keeps everything default-src allowed for connections", () => {
    expect(directive("connect-src")).toEqual(expect.arrayContaining(directive("default-src").filter((s) => s !== "'unsafe-inline'")));
  });
});
