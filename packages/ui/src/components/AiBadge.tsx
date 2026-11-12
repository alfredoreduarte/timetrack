import React from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";

interface AiBadgeProps {
  via?: string;
  className?: string;
}

const labelFor = (via?: string) => {
  switch (via) {
    case "claude_code":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "codex":
      return "Codex";
    case "import":
      return "AI · imported";
    case "mcp":
      return "AI · MCP";
    case "api":
      return "AI · API";
    default:
      return "AI";
  }
};

const AiBadge: React.FC<AiBadgeProps> = ({ via, className }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 ${className || ""}`}
    title="AI-agent work — billed by this project\u2019s AI policy"
  >
    <SparklesIcon className="h-3 w-3" aria-hidden="true" />
    {labelFor(via)}
  </span>
);

export default AiBadge;
