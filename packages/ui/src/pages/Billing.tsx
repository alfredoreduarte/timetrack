import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckIcon } from "@heroicons/react/24/solid";
import api from "../services/api";
import { trialDaysLeft, useBillingStatus } from "../hooks/useBillingStatus";

const PRO_FEATURES = [
  "Unlimited parallel AI agent timers",
  "Full history in timesheets and imports",
  "Client share links",
  "AI usage cost lines on invoices",
  "Billing policies per client",
];

const errorText = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || "Something went wrong";

const Billing: React.FC = () => {
  const { status, error, refresh } = useBillingStatus();
  const [params] = useSearchParams();
  const justPaid = params.get("checkout") === "success";

  // Back from Stripe: the webhook usually lands within seconds; check a few
  // times until the subscription shows up.
  useEffect(() => {
    if (!justPaid || status?.reason === "subscription") return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      refresh();
      if (tries >= 10) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [justPaid, status?.reason, refresh]);
  const [interval, setInterval] = useState<"month" | "year">("year");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const go = async (fn: () => Promise<{ url: string }>) => {
    setBusy(true);
    setActionError(null);
    try {
      window.location.href = (await fn()).url;
    } catch (e) {
      setActionError(errorText(e));
      setBusy(false);
    }
  };

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!status) return <p className="text-sm text-gray-500">Loading…</p>;

  const days = trialDaysLeft(status);
  const headline = (() => {
    switch (status.reason) {
      case "grandfathered":
        return "You have Pro, free — thanks for being an early user.";
      case "billing_disabled":
        return "All features are on.";
      case "subscription":
        return status.subscription?.cancelAtPeriodEnd
          ? `Pro until ${new Date(status.subscription.currentPeriodEnd!).toLocaleDateString()} — renews off.`
          : `Pro${status.subscription?.interval === "year" ? " (yearly)" : " (monthly)"}`;
      case "trial":
        return `Pro trial — ${days} day${days === 1 ? "" : "s"} left`;
      default:
        return "Free plan";
    }
  })();
  const canSubscribe = status.billingEnabled && (status.reason === "free" || status.reason === "trial");
  const monthlyEquivalent = Math.round((status.prices.year.amount / 12) * 100) / 100;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plan & billing</h1>
        <p className="text-gray-600">{headline}</p>
      </div>

      {params.get("checkout") === "success" && (
        <p className="rounded-lg bg-emerald-50 text-emerald-900 px-4 py-2 text-sm">
          Thanks! Your subscription is being activated — it can take a few seconds to show here.
        </p>
      )}
      {params.get("checkout") === "canceled" && (
        <p className="rounded-lg bg-gray-100 text-gray-700 px-4 py-2 text-sm">Checkout canceled. Nothing was charged.</p>
      )}
      {status.subscription?.status === "past_due" && (
        <p className="rounded-lg bg-red-50 text-red-800 px-4 py-2 text-sm">
          Your last payment failed. Update your card to keep Pro.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className={`card p-5 space-y-3 ${status.plan === "free" ? "ring-2 ring-gray-300" : ""}`}>
          <h2 className="font-semibold text-gray-900">Free</h2>
          <p className="text-3xl font-bold text-gray-900">$0</p>
          <ul className="text-sm text-gray-700 space-y-1.5">
            <li>Automatic Claude Code tracking and MCP tools</li>
            <li>{status.limits.maxRunningAgentTimers ?? 2} AI agent timers at once</li>
            <li>Last 14 days in timesheets</li>
            <li>Unlimited manual timers</li>
          </ul>
        </section>
        <section className={`card p-5 space-y-3 ${status.plan === "pro" ? "ring-2 ring-primary-500" : ""}`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-gray-900">Pro</h2>
            {canSubscribe && (
              <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-xs" role="group" aria-label="Billing period">
                {(["month", "year"] as const).map((i) => (
                  <button
                    key={i}
                    onClick={() => setInterval(i)}
                    aria-pressed={interval === i}
                    className={`px-2 py-1 rounded ${interval === i ? "bg-primary-600 text-white" : "text-gray-600"}`}
                  >
                    {i === "month" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ${interval === "year" ? monthlyEquivalent : status.prices.month.amount}
            <span className="text-base font-normal text-gray-500">/mo</span>
          </p>
          <p className="text-xs text-gray-500">
            {interval === "year" ? `$${status.prices.year.amount} billed yearly` : "billed monthly"}
          </p>
          <ul className="text-sm text-gray-700 space-y-1.5">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <CheckIcon className="h-4 w-4 text-primary-600 mt-0.5 shrink-0" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          {canSubscribe && (
            <button className="btn-primary w-full disabled:opacity-50" disabled={busy} onClick={() => go(() => api.billing.checkout(interval))}>
              {status.reason === "trial" ? "Subscribe — billing starts when the trial ends" : "Upgrade to Pro"}
            </button>
          )}
          {status.canManage && (
            <button className="btn-secondary w-full disabled:opacity-50" disabled={busy} onClick={() => go(() => api.billing.portal())}>
              Manage subscription, invoices and card
            </button>
          )}
        </section>
      </div>

      {actionError && <p className="text-sm text-red-700" role="alert">{actionError}</p>}
      <p className="text-xs text-gray-500">
        Running now: {status.usage.runningAgentTimers} AI agent timer{status.usage.runningAgentTimers === 1 ? "" : "s"}. Payments are handled by Stripe; cancel any time from the portal.
      </p>
    </div>
  );
};

export default Billing;
