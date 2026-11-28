import { describe, expect, it } from "vitest";
import { agentLabel } from "../agentFormat";

describe("agentLabel", () => {
  it("names known agents, else falls back by who did the work", () => {
    expect(agentLabel("claude_code")).toBe("Claude Code");
    expect(agentLabel(null, "mcp", true)).toBe("MCP agent");
    expect(agentLabel("some_agent", null, true)).toBe("AI agent");
    expect(agentLabel(null, null, false)).toBe("You");
  });

  it("doesn't take Object's properties for agent names", () => {
    expect(agentLabel("constructor", null, true)).toBe("AI agent");
    expect(agentLabel("toString", "hasOwnProperty", false)).toBe("You");
  });
});
