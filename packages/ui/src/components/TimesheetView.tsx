import React from "react";
import { SparklesIcon, UserIcon } from "@heroicons/react/24/outline";
import type { ProjectTimesheet, Timesheet } from "../types/agent";
import { hm, money } from "../utils/agentFormat";

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const Totals: React.FC<{ p: ProjectTimesheet; currency: string; showAmounts: boolean }> = ({ p, currency, showAmounts }) => {
  const t = p.totals;
  const overlap = t.trackedSeconds > t.wallClockSeconds;
  const items: Array<[string, string, string?]> = [
    ["Billed", hm(t.billedSeconds)],
    ["Tracked", hm(t.trackedSeconds), overlap ? `${t.parallelism}× parallel` : undefined],
    ["AI agents", hm(t.agentTrackedSeconds)],
    ["You", hm(t.humanTrackedSeconds)],
  ];
  if (showAmounts) items.push(["Amount", money(t.amount, currency)]);
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {items.map(([k, v, hint]) => (
        <div key={k}>
          <dt className="text-xs uppercase tracking-wide text-gray-500">{k}</dt>
          <dd className="text-lg font-semibold text-gray-900 tabular-nums">{v}</dd>
          {hint && <dd className="text-xs text-gray-500">{hint}</dd>}
        </div>
      ))}
    </dl>
  );
};

/** A client-ready timesheet: per project, lines per day, notes and disclosure. */
const TimesheetView: React.FC<{ sheet: Timesheet; showAmounts?: boolean }> = ({ sheet, showAmounts = true }) => {
  if (sheet.projects.length === 0) {
    return <p className="text-sm text-gray-600">No time was recorded in this period.</p>;
  }
  return (
    <div className="space-y-6">
      {sheet.projects.map((p, pi) => (
        // Client views strip ids, so the position keeps keys unique.
        <section key={`${pi}-${p.project?.name ?? "none"}`} className="card overflow-hidden">
          <header className="px-5 py-4 border-b border-gray-200 space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.project?.color || "#9CA3AF" }} />
              {p.project?.name || "No project"}
            </h3>
            <Totals p={p} currency={sheet.currency} showAmounts={showAmounts} />
          </header>
          {p.lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Work</th>
                    <th className="text-right px-3 py-2 font-medium">Time</th>
                    <th className="text-right px-3 py-2 font-medium">Billed</th>
                    {showAmounts && <th className="text-right px-5 py-2 font-medium">Amount</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {p.lines.map((l, i) => (
                    <tr key={`${l.date}-${l.timerId ?? ""}-${i}`} className="align-top">
                      <td className="px-5 py-2 whitespace-nowrap text-gray-600">{dayLabel(l.date)}</td>
                      <td className="px-3 py-2 min-w-[14rem]">
                        <p className="text-gray-900 flex items-center gap-1.5">
                          {l.kind === "agent" ? (
                            <SparklesIcon className="h-3.5 w-3.5 text-violet-600 shrink-0" aria-label="AI agent" />
                          ) : (
                            <UserIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-label="Human" />
                          )}
                          {l.description}
                          {l.task && <span className="text-gray-500">· {l.task}</span>}
                        </p>
                        {l.notes.length > 0 && (
                          <ul className="mt-1 text-xs text-gray-600 list-disc pl-5 space-y-0.5">
                            {l.notes.map((n, j) => (
                              <li key={j}>{n}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{hm(l.trackedSeconds)}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${l.billedSeconds < l.trackedSeconds ? "text-gray-500" : "text-gray-900"}`}
                        title={
                          l.billedSeconds < l.trackedSeconds
                            ? "Part of this ran alongside other work on the project and is billed once, in the other row"
                            : undefined
                        }
                      >
                        {hm(l.billedSeconds)}
                        {l.billedSeconds < l.trackedSeconds && <span className="ml-1 text-xs">(overlap)</span>}
                      </td>
                      {showAmounts && <td className="px-5 py-2 text-right tabular-nums">{money(l.amount, sheet.currency)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showAmounts && p.costs.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-sm text-gray-700">
              AI usage passed through ({p.costs.length} session{p.costs.length === 1 ? "" : "s"}):{" "}
              <span className="font-medium">{money(p.totals.costsBilledUsd, "USD")}</span>
              {!p.totals.costsIncluded && <span className="text-amber-700"> (USD, not included in the {sheet.currency} total)</span>}
              <span className="text-gray-500"> · API-equivalent list prices as of {sheet.pricingAsOf}</span>
            </div>
          )}
          {p.disclosure.length > 0 && (
            <footer className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-600 space-y-1">
              {p.disclosure.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
            </footer>
          )}
        </section>
      ))}
      {showAmounts && sheet.projects.length > 1 && (
        <p className="text-right text-sm text-gray-900">
          Total: <span className="font-semibold">{hm(sheet.totals.billedSeconds)}</span> billed ·{" "}
          <span className="font-semibold">{money(sheet.totals.amount, sheet.currency)}</span>
        </p>
      )}
    </div>
  );
};

export default TimesheetView;
