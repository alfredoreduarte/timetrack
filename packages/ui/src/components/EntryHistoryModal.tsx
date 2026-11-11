import React, { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import type { AuditEvent } from "../types/agent";

const ACTIONS: Record<string, string> = {
  create: "Created",
  update: "Edited",
  delete: "Deleted",
  start: "Started",
  stop: "Stopped",
  discard_empty: "Discarded (empty)",
};

const FIELDS: Record<string, string> = {
  description: "description",
  startTime: "start",
  endTime: "end",
  duration: "duration",
  projectId: "project",
  taskId: "task",
  hourlyRateSnapshot: "rate",
  isAiGenerated: "AI flag",
  stopReason: "reason",
};

const show = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
};

const who = (e: AuditEvent) =>
  e.actorType === "system" ? "TimeTrack (automatic)" : e.actorType === "api_key" ? e.actorLabel || "An API key" : "You";

/** Who changed this entry, when, through which client, and what changed. */
const EntryHistoryModal: React.FC<{ entryId: string; onClose: () => void }> = ({ entryId, onClose }) => {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.entryHistory(entryId).then(setEvents, (e) => setError(e?.response?.data?.error || "Couldn't load history"));
  }, [entryId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 id="history-title" className="font-semibold text-gray-900">Entry history</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!events && !error && <p className="text-sm text-gray-500">Loading…</p>}
          {events && events.length === 0 && <p className="text-sm text-gray-500">No changes recorded yet.</p>}
          <ol className="space-y-3">
            {events?.map((e) => (
              <li key={e.id} className="text-sm">
                <p className="text-gray-900">
                  <span className="font-medium">{ACTIONS[e.action] ?? e.action}</span> by {who(e)}
                  {e.via && e.via !== "web" && <span className="text-gray-500"> via {e.via}</span>}
                </p>
                <p className="text-xs text-gray-500">{new Date(e.createdAt).toLocaleString()}</p>
                {e.changes && e.action === "update" && (
                  <ul className="mt-1 text-xs text-gray-700 space-y-0.5">
                    {Object.entries(e.changes).map(([field, c]) => (
                      <li key={field}>
                        {FIELDS[field] ?? field}: <span className="line-through text-gray-400">{show(c.from)}</span> → {show(c.to)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

export default EntryHistoryModal;
