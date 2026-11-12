import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { trialDaysLeft, useBillingStatus } from "../hooks/useBillingStatus";

/** One quiet line about the plan, only when it's actionable. */
const PlanBanner: React.FC = () => {
  const { status } = useBillingStatus();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  if (!status?.billingEnabled || dismissed || location.pathname.startsWith("/billing")) return null;

  let text: string | null = null;
  let tone = "bg-primary-50 text-primary-900 border-primary-100";
  if (status.subscription?.status === "past_due") {
    text = "Your last payment failed. Update your card to keep Pro.";
    tone = "bg-red-50 text-red-800 border-red-100";
  } else if (status.reason === "trial") {
    const days = trialDaysLeft(status);
    text = `Pro trial: ${days} day${days === 1 ? "" : "s"} left. Pick a plan to keep up to 25 parallel agents and full timesheets.`;
  } else if (status.reason === "free") {
    text = `Free plan: ${status.limits.maxRunningAgentTimers} agents at once and ${status.limits.historyDays} days of timesheets.`;
  }
  if (!text) return null;

  return (
    <div className={`border-b px-4 md:px-6 py-2 text-sm flex flex-wrap items-center justify-between gap-2 ${tone}`} role="status">
      <span>{text}</span>
      <span className="flex items-center gap-3">
        <Link to="/billing" className="font-medium underline">
          {status.subscription?.status === "past_due" ? "Update payment" : "See plans"}
        </Link>
        <button onClick={() => setDismissed(true)} className="opacity-70 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      </span>
    </div>
  );
};

export default PlanBanner;
