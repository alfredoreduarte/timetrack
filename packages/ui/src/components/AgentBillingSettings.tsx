import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { AppDispatch, RootState } from "../store";
import { updateProfile } from "../store/slices/authSlice";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "BRL", "ARS", "MXN", "PYG", "CHF", "JPY", "INR"];

/** Defaults for how AI-agent time is tracked and billed. Projects can override billing. */
const AgentBillingSettings: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.auth.user);
  const [idleMinutes, setIdleMinutes] = useState("15");
  const [overlap, setOverlap] = useState<"dedupe" | "sum">("dedupe");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setIdleMinutes(String(Math.round((user.agentIdleTimeoutSeconds ?? 900) / 60)));
    setOverlap(user.overlapMode ?? "dedupe");
    setCurrency(user.currency ?? "USD");
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const minutes = parseInt(idleMinutes, 10);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      toast.error("Idle time must be between 1 and 1440 minutes");
      return;
    }
    setSaving(true);
    try {
      await dispatch(updateProfile({ agentIdleTimeoutSeconds: minutes * 60, overlapMode: overlap, currency })).unwrap();
      toast.success("Saved");
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="card p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">AI work & billing</h2>
        <p className="text-sm text-gray-600">How agent sessions are tracked, and how parallel agents are billed by default.</p>
      </div>

      <label className="block">
        <span className="block text-sm font-medium text-gray-700">Pause an agent session after</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1440}
            className="input-field w-24"
            value={idleMinutes}
            onChange={(e) => setIdleMinutes(e.target.value)}
          />
          <span className="text-sm text-gray-600">minutes without activity</span>
        </span>
        <span className="mt-1 block text-xs text-gray-500">
          The timer stops at the last prompt or tool call, so the quiet time is never billed. The next activity resumes it.
        </span>
      </label>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700">When several agents work on one project at once</legend>
        <div className="mt-2 space-y-2 text-sm">
          <label className="flex gap-2">
            <input type="radio" name="overlap" checked={overlap === "dedupe"} onChange={() => setOverlap("dedupe")} />
            <span>
              <span className="font-medium text-gray-900">Bill the overlap once</span>
              <span className="block text-gray-600">A client never pays for more hours than the clock shows. Recommended.</span>
            </span>
          </label>
          <label className="flex gap-2">
            <input type="radio" name="overlap" checked={overlap === "sum"} onChange={() => setOverlap("sum")} />
            <span>
              <span className="font-medium text-gray-900">Bill every agent in full</span>
              <span className="block text-gray-600">Agent-hours: three agents for an hour bill three hours.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <label className="block">
        <span className="block text-sm font-medium text-gray-700">Currency on timesheets</span>
        <select className="input-field mt-1 w-32" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {currency !== "USD" && (
          <span className="block text-xs text-gray-500 mt-1">
            AI usage costs are priced in USD, so on {currency} timesheets they're listed separately and not added to the total.
          </span>
        )}
      </label>

      <button type="submit" className="btn-primary disabled:opacity-50" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
};

export default AgentBillingSettings;
