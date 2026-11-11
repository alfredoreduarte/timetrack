import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import TimesheetView from "../components/TimesheetView";
import type { PublicTimesheetView } from "../types/agent";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

/** The read-only page a developer's client opens from a share link. */
const PublicTimesheet: React.FC = () => {
  const { token = "" } = useParams();
  const [view, setView] = useState<PublicTimesheetView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    document.title = "Timesheet";
    api.publicTimesheets.get(token).then(setView, () => setMissing(true));
  }, [token]);

  if (missing) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-gray-900">This timesheet link isn't available</h1>
          <p className="text-gray-600">It may have expired or been turned off. Ask the sender for a new link.</p>
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
            {day(timesheet.range.startDate)} – {day(timesheet.range.endDate)} · times in {timesheet.range.timezone}
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
