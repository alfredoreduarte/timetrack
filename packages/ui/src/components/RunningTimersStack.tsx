import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { StopIcon, ClockIcon } from "@heroicons/react/24/solid";
import { AppDispatch, RootState } from "../store";
import {
  selectRunningEntries,
  selectStoppingIds,
  stopTimer,
} from "../store/slices/timerSlice";
import { fetchDashboardEarnings } from "../store/slices/dashboardSlice";
import { fetchTimeEntries } from "../store/slices/timeEntriesSlice";
import AiBadge from "./AiBadge";

const pad = (n: number) => n.toString().padStart(2, "0");

const formatElapsed = (totalSeconds: number) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const RunningTimersStack: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const entries = useSelector(selectRunningEntries);
  const elapsedById = useSelector(
    (state: RootState) => state.timer.elapsedById
  );
  const stoppingIds = useSelector(selectStoppingIds);

  if (entries.length === 0) return null;

  const handleStop = async (id: string) => {
    try {
      await dispatch(stopTimer(id)).unwrap();
      dispatch(fetchDashboardEarnings());
      dispatch(fetchTimeEntries({ limit: 10 }));
    } catch {
      // Errors surface via the timer slice's error state.
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <ClockIcon
            className="h-4 w-4 text-green-600 animate-pulse"
            aria-hidden="true"
          />
          Running now ({entries.length})
        </h3>
      </div>
      <ul
        className="divide-y divide-gray-100"
        aria-label="Running timers"
        aria-live="polite"
      >
        {entries.map((entry) => {
          const elapsed = elapsedById[entry.id] ?? entry.duration ?? 0;
          const project = entry.project;
          const task = entry.task;
          return (
            <li
              key={entry.id}
              className="px-6 py-3 flex items-center gap-3 flex-wrap"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {project?.color && (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                    <span className="truncate">
                      {project?.name || "No project"}
                    </span>
                    {task?.name && (
                      <>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-700 truncate">
                          {task.name}
                        </span>
                      </>
                    )}
                    {entry.isAiGenerated && (
                      <AiBadge via={entry.createdVia} />
                    )}
                  </div>
                  {entry.description && (
                    <p className="text-xs text-gray-500 truncate">
                      {entry.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="font-mono font-medium tabular-nums text-gray-900 text-sm">
                {formatElapsed(elapsed)}
              </div>
              <button
                type="button"
                onClick={() => handleStop(entry.id)}
                disabled={!!stoppingIds[entry.id]}
                className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                title={`Stop ${project?.name || "timer"}`}
                aria-label={`Stop timer for ${project?.name || "entry"}`}
              >
                <StopIcon className="h-4 w-4" aria-hidden="true" />
                {stoppingIds[entry.id] ? "Stopping..." : "Stop"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default RunningTimersStack;
