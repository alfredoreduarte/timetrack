import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store";
import { useTimer } from "../../hooks/useTimer";
import {
  fetchTimeEntries,
  TimeEntry,
} from "../../store/slices/timeEntriesSlice";
import { fetchProjects } from "../../store/slices/projectsSlice";
import { formatReportsDuration, formatDateTime } from "../../utils/dateTime";
import { ClockIcon } from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/24/solid";

const ElectronRecentTimers: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { entries, loading } = useSelector(
    (state: RootState) => state.timeEntries
  );
  const { projects, tasks } = useSelector((state: RootState) => state.projects);
  const { isRunning, startTimer, loading: timerLoading } = useTimer();

  // Load initial data
  useEffect(() => {
    dispatch(fetchTimeEntries({ limit: 20 }));
    dispatch(fetchProjects());
  }, [dispatch]);

  const handleResumeTimer = async (entry: TimeEntry) => {
    if (isRunning || timerLoading) return;

    try {
      await startTimer({
        projectId: entry.projectId || undefined,
        taskId: entry.taskId || undefined,
        description: entry.description || undefined,
      });
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  // Filter to only completed entries (with endTime)
  const completedEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry.endTime)
    : [];

  const truncateText = (text: string | undefined, maxLength: number = 25) => {
    if (!text) return "No description";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-medium text-gray-900">Recent Timers</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && completedEntries.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            Loading recent timers...
          </div>
        ) : completedEntries.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No recent timers found.
            <br />
            Start tracking to see your entries here.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {completedEntries.map((entry) => {
              const project = projects.find((p) => p.id === entry.projectId);
              const task = entry.taskId
                ? tasks.find((t) => t.id === entry.taskId)
                : null;

              return (
                <div
                  key={entry.id}
                  className="p-3 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Project Name */}
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {project?.name || "Unknown Project"}
                      </div>

                      {/* Task Name */}
                      {task && (
                        <div className="text-xs text-gray-600 truncate mt-0.5">
                          {task.name}
                        </div>
                      )}

                      {/* Description */}
                      <div className="text-xs text-gray-500 mt-0.5">
                        {truncateText(entry.description)}
                      </div>

                      {/* Duration and Date */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                          <ClockIcon className="h-3 w-3" />
                          <span>{formatReportsDuration(entry.duration)}</span>
                        </div>
                        <span>•</span>
                        <span>
                          {new Date(entry.startTime).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Resume Button */}
                    <button
                      onClick={() => handleResumeTimer(entry)}
                      disabled={isRunning || timerLoading}
                      className="no-drag opacity-0 group-hover:opacity-100 p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Resume this timer"
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ElectronRecentTimers;
