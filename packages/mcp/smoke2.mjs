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

let buffer = "";
const pending = new Map();
let nextId = 1;

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });

const notify = (method, params = {}) => {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
};

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (e) {
      console.error("non-JSON line:", line);
    }
  }
});

const parseToolText = (resp) => JSON.parse(resp.result.content[0].text);

try {
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke2", version: "0" },
  });
  notify("notifications/initialized");
  await new Promise((r) => setTimeout(r, 50));

  console.log("=== list_projects ===");
  const projects = parseToolText(
    await send("tools/call", { name: "list_projects", arguments: {} })
  );
  const pid = projects.projects[0]?.id;
  console.log("  picked project:", projects.projects[0]?.name, pid);

  // Stop any current running timer
  const current = parseToolText(
    await send("tools/call", { name: "current_timer", arguments: {} })
  );
  if (current.timeEntry) {
    await send("tools/call", {
      name: "stop_timer",
      arguments: { id: current.timeEntry.id },
    });
  }

  console.log("=== start_timer (no headers; key is AI by default) ===");
  const started = parseToolText(
    await send("tools/call", {
      name: "start_timer",
      arguments: { description: "MCP smoke task", projectId: pid },
    })
  );
  const entry = started.timeEntry;
  console.log("  isAiGenerated=", entry.isAiGenerated, "createdVia=", entry.createdVia);

  console.log("=== stop_timer (defaults to current) ===");
  const stopped = parseToolText(
    await send("tools/call", { name: "stop_timer", arguments: {} })
  );
  console.log("  stopped id=", stopped.timeEntry?.id);

  // cleanup
  const final = parseToolText(
    await send("tools/call", {
      name: "recent_entries",
      arguments: { limit: 5 },
    })
  );
  const ours = final.timeEntries.find((e) => e.description === "MCP smoke task");
  if (ours) console.log("  recorded entry isAi=", ours.isAiGenerated, "via=", ours.createdVia);
} finally {
  child.kill();
}
