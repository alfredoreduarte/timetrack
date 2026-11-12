import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ClipboardDocumentIcon, ArrowDownTrayIcon, LinkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { AppDispatch, RootState } from "../store";
import { fetchProjects } from "../store/slices/projectsSlice";
import TimesheetView from "../components/TimesheetView";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { browserTimezone } from "../utils/agentFormat";
import type { ShareLink, Timesheet as TimesheetData } from "../types/agent";

type Preset = "this-week" | "last-week" | "this-month" | "last-month";
const PRESETS: Array<[Preset, string]> = [
  ["this-week", "This week"],
  ["last-week", "Last week"],
  ["this-month", "This month"],
  ["last-month", "Last month"],
];

/**
 * Local-time ranges; the API is told the timezone for day boundaries. Every
 * preset has a real end (the API clamps it to now): a share link for "this
 * month" must stop at the end of the month, not keep showing later work.
 */
export function rangeFor(p: Preset, now = new Date()): { startDate: string; endDate: string } {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (p === "this-month" || p === "last-month") {
    const offset = p === "last-month" ? 1 : 0;
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  const monday = midnight(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = new Date(monday);
  if (p === "last-week") start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

const errorBody = (e: unknown): string | undefined => {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string") {
    try {
      return (JSON.parse(data) as { error?: string }).error;
    } catch {
      return undefined;
    }
  }
  return (data as { error?: string } | undefined)?.error;
};

const errorText = (e: unknown) => errorBody(e) || "Something went wrong";

const ShareDialog: React.FC<{
  projectId?: string;
  range: { startDate: string; endDate: string };
  onClose: () => void;
  onCreated: () => void;
}> = ({ projectId, range, onClose, onCreated }) => {
  const [rolling, setRolling] = useState(false);
  const [showAmounts, setShowAmounts] = useState(true);
  const [showNotes, setShowNotes] = useState(true);
  const [name, setName] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copied, copyToClipboard } = useCopyToClipboard();

  const create = async () => {
    setError(null);
    try {
      const r = await api.shareLinks.create({
        name: name || undefined,
        projectId,
        timezone: browserTimezone(),
        showAmounts,
        showNotes,
        ...(rolling ? { rollingDays: 30 } : { startDate: range.startDate, endDate: range.endDate }),
      });
      setUrl(r.url);
      onCreated();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
        <h2 id="share-title" className="font-semibold text-gray-900">Share with your client</h2>
        {url ? (
          <>
            <p className="text-sm text-gray-600">Anyone with this link can view the timesheet. You can revoke it any time.</p>
            <div className="flex gap-2">
              <input readOnly value={url} className="input-field text-xs font-mono" aria-label="Share link" onFocus={(e) => e.target.select()} />
              <button className="btn-primary whitespace-nowrap" onClick={() => copyToClipboard(url)}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex justify-end">
              <button className="btn-secondary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block text-sm">
              <span className="text-gray-700">Name (only you see it)</span>
              <input className="input-field mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme — March" />
            </label>
            <fieldset className="text-sm space-y-2">
              <legend className="text-gray-700 mb-1">Period</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!rolling} onChange={() => setRolling(false)} /> The period shown
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={rolling} onChange={() => setRolling(true)} /> Always the last 30 days (live)
              </label>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showAmounts} onChange={(e) => setShowAmounts(e.target.checked)} /> Show rates and amounts
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} /> Show work notes
            </label>
            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error} {/plan_limit|Pro/.test(error) && <Link to="/billing" className="underline">See plans</Link>}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" onClick={create}>
                Create link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Timesheet: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const projects = useSelector((s: RootState) => s.projects.projects);
  const [preset, setPreset] = useState<Preset>("this-month");
  const [projectId, setProjectId] = useState("");
  const [sheet, setSheet] = useState<TimesheetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const { copied, copyToClipboard } = useCopyToClipboard();

  const range = useMemo(() => rangeFor(preset), [preset]);
  const params = useMemo(
    () => ({ ...range, projectId: projectId || undefined, timezone: browserTimezone() }),
    [range, projectId]
  );

  // Only the latest request may update the page: a slow response for a
  // previous period must not overwrite the current one.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.timesheets.get(params);
      if (id === latest.current) setSheet(result);
    } catch (e) {
      if (id === latest.current) {
        setError(errorText(e));
        setSheet(null);
      }
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [params]);

  const loadLinks = useCallback(() => {
    api.shareLinks.list().then(setLinks, () => setLinks([]));
  }, []);

  useEffect(() => {
    dispatch(fetchProjects());
    loadLinks();
  }, [dispatch, loadLinks]);
  useEffect(() => {
    load();
  }, [load]);

  const downloadCsv = async () => {
    try {
      const csv = await api.timesheets.csv(params);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `timesheet-${preset}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const copyMarkdown = async () => {
    try {
      copyToClipboard(await api.timesheets.markdown(params));
    } catch (e) {
      setError(errorText(e));
    }
  };

  const revoke = async (id: string) => {
    await api.shareLinks.revoke(id);
    loadLinks();
  };

  const activeLinks = links.filter((l) => !l.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheet</h1>
          <p className="text-gray-600">What your client sees: billed time per project, with AI work and parallel agents handled by each project's policy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50" disabled={!sheet} onClick={copyMarkdown}>
            <ClipboardDocumentIcon className="h-4 w-4" /> {copied ? "Copied" : "Copy as Markdown"}
          </button>
          <button className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50" disabled={!sheet} onClick={downloadCsv}>
            <ArrowDownTrayIcon className="h-4 w-4" /> CSV
          </button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setSharing(true)}>
            <LinkIcon className="h-4 w-4" /> Share with client
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Period">
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              aria-pressed={preset === key}
              className={`px-3 py-1.5 text-sm rounded-md ${preset === key ? "bg-primary-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="ts-project">Project</label>
        <select id="ts-project" className="input-field w-auto" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {sheet?.limitedByPlan && (
        <p className="text-sm rounded-lg bg-amber-50 text-amber-900 px-4 py-2">
          The Free plan shows the last {sheet.limitedByPlan.historyDays} days. <Link to="/billing" className="underline">Upgrade</Link> for full history.
        </p>
      )}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {loading && !sheet && <p className="text-sm text-gray-500">Loading…</p>}
      {sheet && <TimesheetView sheet={sheet} />}

      {activeLinks.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Share links</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {activeLinks.map((l) => (
              <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-gray-900">{l.name || l.project?.name || "All projects"}</span>{" "}
                  <span className="text-gray-500">
                    · {l.rollingDays ? `last ${l.rollingDays} days` : l.endDate ? "fixed period" : "open-ended (live)"} · {l.viewCount}{" "}
                    view{l.viewCount === 1 ? "" : "s"}
                    {!l.showAmounts && " · hours only"}
                  </span>
                </span>
                <button className="text-red-600 hover:underline" onClick={() => revoke(l.id)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sharing && <ShareDialog projectId={projectId || undefined} range={range} onClose={() => setSharing(false)} onCreated={loadLinks} />}
    </div>
  );
};

export default Timesheet;
