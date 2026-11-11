import type { Timesheet } from "../services/timesheets";
import { formatMoney } from "../services/timesheets";
import { localDateKey } from "./time";

/** 1:05 style duration (hours:minutes), rounded to the minute. */
export const hm = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
};

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** Markdown timesheet — pasteable into an invoice email, PR or doc. */
export function timesheetToMarkdown(t: Timesheet, opts: { showAmounts?: boolean } = {}): string {
  const money = (n: number) => formatMoney(n, t.currency);
  const showAmounts = opts.showAmounts !== false;
  // Local dates, end shown inclusive (the range end is exclusive).
  const tz = t.range.timezone;
  const first = localDateKey(new Date(t.range.startDate), tz);
  const last = localDateKey(new Date(Date.parse(t.range.endDate) - 1), tz);
  const out: string[] = [];
  out.push(`# Timesheet — ${t.user.name}`);
  out.push("");
  out.push(`${first} → ${last} · ${tz}`);

  for (const p of t.projects) {
    out.push("");
    out.push(`## ${p.project?.name ?? "No project"}`);
    out.push("");
    if (p.lines.length === 0) {
      out.push("_No time recorded in this period._");
      continue;
    }
    out.push(showAmounts ? "| Date | Work | By | Time | Billed | Amount |" : "| Date | Work | By | Time | Billed |");
    out.push(showAmounts ? "|---|---|---|---:|---:|---:|" : "|---|---|---|---:|---:|");
    for (const l of p.lines) {
      const work = mdCell([l.description, ...l.notes.map((n) => `• ${n}`)].join(" "));
      const by = l.kind === "agent" ? "AI agent" : "Human";
      const row = [l.date, work, by, hm(l.trackedSeconds), hm(l.billedSeconds)];
      if (showAmounts) row.push(money(l.amount));
      out.push(`| ${row.join(" | ")} |`);
    }
    out.push("");
    const parts = [`**Billed ${hm(p.totals.billedSeconds)}**`, `tracked ${hm(p.totals.trackedSeconds)}`];
    if (p.totals.trackedSeconds > p.totals.wallClockSeconds) parts.push(`wall-clock ${hm(p.totals.wallClockSeconds)}`);
    if (showAmounts) parts.push(`**${money(p.totals.timeAmount)}**`);
    out.push(parts.join(" · "));
    if (showAmounts && p.costs.length > 0) {
      const raw = p.costs.reduce((s, c) => s + c.costUsd, 0);
      out.push("");
      const usd = (n: number) => formatMoney(n, "USD");
      const sessions = `${p.costs.length} session${p.costs.length === 1 ? "" : "s"}`;
      out.push(
        p.totals.costsIncluded
          ? `AI usage (API-equivalent, ${sessions}): ${usd(raw)} → billed ${usd(p.totals.costsBilledUsd)}`
          : `AI usage (API-equivalent, ${sessions}): ${usd(raw)} → billed ${usd(p.totals.costsBilledUsd)} (USD, not included in the total)`
      );
      out.push("");
      out.push(`**Project total: ${money(p.totals.amount)}**`);
    }
    if (p.disclosure.length > 0) {
      out.push("");
      for (const d of p.disclosure) out.push(`> ${d}`);
    }
  }
  if (showAmounts && t.projects.length > 1) {
    out.push("");
    out.push(`**Total: ${hm(t.totals.billedSeconds)} billed · ${money(t.totals.amount)}**`);
  }
  out.push("");
  return out.join("\n");
}

/** Escapes a CSV cell and neutralizes spreadsheet formula injection. */
export const csvCell = (value: unknown): string => {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function timesheetToCsv(t: Timesheet, opts: { showAmounts?: boolean } = {}): string {
  const showAmounts = opts.showAmounts !== false;
  const header = ["Date", "Project", "Work", "Notes", "By", "Agent", "Task", "Tracked (h)", "Billed (h)"];
  if (showAmounts) header.push("Rate", "Amount", "Currency");
  const rows = [header.map(csvCell).join(",")];
  for (const p of t.projects) {
    for (const l of p.lines) {
      const row: unknown[] = [
        l.date,
        p.project?.name ?? "",
        l.description,
        l.notes.join(" | "),
        l.kind === "agent" ? "AI agent" : "Human",
        l.agent ?? "",
        l.task ?? "",
        (l.trackedSeconds / 3600).toFixed(2),
        (l.billedSeconds / 3600).toFixed(2),
      ];
      if (showAmounts) row.push(l.rate.toFixed(2), l.amount.toFixed(2), t.currency);
      rows.push(row.map(csvCell).join(","));
    }
    if (showAmounts) {
      for (const c of p.costs) {
        rows.push(
          [c.date, p.project?.name ?? "", `AI usage: ${c.description}`, "", "AI usage", "", "", "", "", "", c.billedUsd.toFixed(2), "USD"]
            .map(csvCell)
            .join(",")
        );
      }
    }
  }
  return rows.join("\n") + "\n";
}
