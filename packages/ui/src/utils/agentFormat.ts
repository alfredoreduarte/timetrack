const pad = (n: number) => n.toString().padStart(2, "0");

/** 1:05:09 style clock for live timers. */
export const clock = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** "3h 05m" / "42m" for totals. */
export const hm = (totalSeconds: number) => {
  // A few seconds of work still has a price; don't show it as "0m".
  if (totalSeconds > 0 && totalSeconds < 30) return "<1m";
  const minutes = Math.round(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${pad(minutes % 60)}m` : `${minutes}m`;
};

export const money = (amount: number, currency = "USD") => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const AGENTS: Record<string, string> = { claude_code: "Claude Code", cursor: "Cursor", codex: "Codex", mcp: "MCP agent" };

/** Human label for who's doing the work. */
export const agentLabel = (agent: string | null | undefined, via?: string | null, isAi?: boolean) =>
  (agent && AGENTS[agent]) || (via && AGENTS[via]) || (isAi ? "AI agent" : "You");

/** "acme/web" from a normalized remote, else the folder name. */
export const repoLabel = (gitRemote?: string | null, cwd?: string | null) => {
  if (gitRemote) return gitRemote.split("/").slice(-2).join("/");
  if (cwd) return cwd.replace(/\/+$/, "").split("/").pop() || null;
  return null;
};

export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
