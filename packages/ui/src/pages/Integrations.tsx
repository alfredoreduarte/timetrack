import React, { useEffect, useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import api from "../services/api";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import type { Timer } from "../types/agent";

const apiBase = () => {
  const configured = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/$/, "");
  return `${window.location.origin}/api`;
};

const Snippet: React.FC<{ code: string; label: string }> = ({ code, label }) => {
  const { copied, copyToClipboard } = useCopyToClipboard();
  return (
    <div className="relative">
      <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 pr-20 overflow-x-auto" aria-label={label}>
        <code>{code}</code>
      </pre>
      <button
        className="absolute top-2 right-2 text-xs bg-white/10 hover:bg-white/20 text-white rounded px-2 py-1"
        onClick={() => copyToClipboard(code)}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};

/**
 * Onboarding for AI agents: create a key, install the Claude Code plugin,
 * and watch for the first tracked session.
 */
const Integrations: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [agentTimers, setAgentTimers] = useState<Timer[] | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      api.timers.list("all", 20).then(
        (ts) => alive && setAgentTimers(ts.filter((t) => t.isAiGenerated)),
        () => alive && setAgentTimers([])
      );
    check();
    const id = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const createKey = async () => {
    setKeyError(null);
    try {
      const r = await api.apiKeys.create({ name: "Claude Code", aiByDefault: true });
      setToken(r.token);
    } catch (e) {
      setKeyError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't create a key");
    }
  };

  const base = apiBase();
  const connected = (agentTimers?.length ?? 0) > 0;
  const keyText = token ?? "tt_your_key";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connect your agents</h1>
        <p className="text-gray-600">
          Every Claude Code session gets its own timer. Sessions that go quiet pause by themselves, and the agent can fix entries and
          build timesheets for you.
        </p>
      </div>

      <ol className="space-y-5">
        <li className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">1. Create an API key</h2>
          {token ? (
            <>
              <p className="text-sm text-gray-600">Copy it now — it won't be shown again.</p>
              <Snippet code={token} label="API key" />
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">The key lets Claude Code record time for you. Entries it creates are marked as AI work.</p>
              <button className="btn-primary" onClick={createKey}>
                Create key
              </button>
              {keyError && <p className="text-sm text-red-700">{keyError}</p>}
            </>
          )}
        </li>

        <li className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">2. Install the Claude Code plugin</h2>
          <p className="text-sm text-gray-600">Run this in your terminal and paste your key when it asks:</p>
          <Snippet code="claude plugin install timetrack --marketplace alfredoreduarte/timetrack" label="Install command" />
          <p className="text-xs text-gray-500">
            Or inside Claude Code: <code>/plugin marketplace add alfredoreduarte/timetrack</code>, then{" "}
            <code>/plugin install timetrack@timetrack</code>. The plugin sends only the session id, folder and git repo — never
            prompts or code. Your last 30 days of sessions are imported on first run.
          </p>
        </li>

        <li className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">3. Start a Claude Code session</h2>
          {connected ? (
            <p className="text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Connected — {agentTimers!.length} agent session{agentTimers!.length === 1 ? "" : "s"} tracked. They appear on your
              dashboard.
            </p>
          ) : (
            <p className="text-sm text-gray-600" aria-live="polite">
              Waiting for your first session… open Claude Code in any repository.
            </p>
          )}
        </li>
      </ol>

      <details className="card p-5">
        <summary className="font-medium text-gray-900 cursor-pointer">Other agents and manual setup</summary>
        <div className="mt-4 space-y-4 text-sm text-gray-700">
          <div className="space-y-2">
            <p>MCP only (Claude Code, Cursor or any client with HTTP MCP support):</p>
            <Snippet
              label="MCP command"
              code={`claude mcp add --transport http timetrack ${base}/mcp \\\n  --header "Authorization: Bearer ${keyText}"`}
            />
          </div>
          <div className="space-y-2">
            <p>Import past Claude Code sessions again (preview first):</p>
            <Snippet
              label="Import command"
              code={`TIMETRACK_API_URL=${base} TIMETRACK_API_KEY=${keyText} \\\n  node ~/.claude/plugins/marketplaces/timetrack/plugins/timetrack/scripts/import-transcripts.mjs --dry-run`}
            />
          </div>
        </div>
      </details>
    </div>
  );
};

export default Integrations;
