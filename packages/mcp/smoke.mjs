import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const token = readFileSync("/tmp/mcp_test_token", "utf8").trim();

const child = spawn("node", ["dist/index.js"], {
  cwd: new URL(".", import.meta.url).pathname,
  env: {
    ...process.env,
    TIMETRACK_API_URL: "http://localhost:3011",
    TIMETRACK_API_KEY: token,
  },
  stdio: ["pipe", "pipe", "inherit"],
});

const send = (msg) => {
  child.stdin.write(JSON.stringify(msg) + "\n");
};

let buffer = "";
const results = [];
const want = 3;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      results.push(msg);
      if (results.length >= want) finish();
    } catch (e) {
      console.error("non-JSON line:", line);
    }
  }
});

function finish() {
  for (const r of results) {
    if (r.id === 1) {
      console.log("[initialize] capabilities=", Object.keys(r.result.capabilities ?? {}).join(","));
    } else if (r.id === 2) {
      console.log("[tools/list] tools=", r.result.tools.map((t) => t.name).join(","));
    } else if (r.id === 3) {
      const content = r.result.content?.[0]?.text ?? "";
      const preview = content.length > 200 ? content.slice(0, 200) + "…" : content;
      console.log("[whoami]", preview);
    }
  }
  child.kill();
  process.exit(0);
}

// MCP requires initialize first
send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  },
});
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
setTimeout(() => {
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "whoami", arguments: {} },
  });
}, 100);

setTimeout(() => {
  console.error("TIMEOUT");
  child.kill();
  process.exit(1);
}, 15000);
