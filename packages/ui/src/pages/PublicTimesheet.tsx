import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import TimesheetView from "../components/TimesheetView";
import type { PublicTimesheetView } from "../types/agent";

/** A date as the sheet's own zone sees it (the client may be elsewhere). */
const day = (iso: string, timeZone: string, offsetMs = 0) =>
  new Date(Date.parse(iso) + offsetMs).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });

/** The read-only page a developer's client opens from a share link. */
const PublicTimesheet: React.FC = () => {
  const { token = "" } = useParams();
  const [view, setView] = useState<PublicTimesheetView | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "error" | "ok">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.title = "Timesheet";
    let alive = true;
    setState("loading");
    api.publicTimesheets.get(token).then(
      (v) => {
        if (!alive) return;
        setView(v);
        setState("ok");
      },
      (e: { response?: { status?: number } }) => {
        // Only a 404 means the link is gone; anything else is worth a retry.
        if (alive) setState(e?.response?.status === 404 ? "missing" : "error");
      }
    );
    return () => {
      alive = false;
    };
  }, [token, attempt]);

  if (state === "missing") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-gray-900">This timesheet link isn't available</h1>
          <p className="text-gray-600">It may have expired or been turned off. Ask the sender for a new link.</p>
        </div>
      </main>
    );
  }
  if (state === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <h1 className="text-xl font-semibold text-gray-900">Couldn't load this timesheet</h1>
          <button className="btn-primary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!view) return <main className="min-h-screen p-6 text-sm text-gray-500">Loading…</main>;

  const { timesheet, link } = view;
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-gray-500">Timesheet from</p>
          <h1 className="text-2xl font-bold text-gray-900">{timesheet.user.name}</h1>
          <p className="text-gray-600">
            {/* The range end is exclusive: show the last day it includes. */}
            {day(timesheet.range.startDate, timesheet.range.timezone)} – {day(timesheet.range.endDate, timesheet.range.timezone, -1)} · times
            in {timesheet.range.timezone}
          </p>
        </header>
        <TimesheetView sheet={timesheet} showAmounts={link.showAmounts} />
        <footer className="text-xs text-gray-500 pt-4 border-t border-gray-200">
          Generated {new Date(timesheet.generatedAt).toLocaleString()} by TimeTrack. Every change to these entries is kept in an audit trail.
        </footer>
      </div>
    </main>
  );
};

export default PublicTimesheet;
