import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store";
import { useTimer } from "../hooks/useTimer";
import { fetchTimeEntries } from "../store/slices/timeEntriesSlice";
import { ClockIcon } from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/24/solid";

const ResumeLastTimer: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { entries } = useSelector((state: RootState) => state.timeEntries);
  const { projects, tasks } = useSelector((state: RootState) => state.projects);

  // Use centralized timer hook
  const { isRunning, currentEntry, loading, startTimer } = useTimer();

  // Refresh time entries when timer stops (currentEntry becomes null and isRunning becomes false)
  useEffect(() => {
    if (!isRunning && !currentEntry && !loading) {
      // Small delay to ensure the stop timer API call has completed
      const timeoutId = setTimeout(() => {
        dispatch(fetchTimeEntries({ limit: 10 }));
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [isRunning, currentEntry, loading, dispatch]);

  // Get the most recent completed time entry (has endTime, not currently running)
  // Ensure entries is an array and filter for completed entries
  const completedEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry.endTime && entry.projectId)
    : [];

  const lastEntry = completedEntries[0]; // Most recent completed entry

  // Get the project for the last entry
  const lastProject =
    lastEntry?.projectId && Array.isArray(projects)
      ? projects.find((p) => p.id === lastEntry.projectId)
      : null;

  // Get the task for the last entry
  const lastTask =
    lastEntry?.taskId && Array.isArray(tasks)
      ? tasks.find((t) => t.id === lastEntry.taskId)
      : null;

  // Format time display for the duration
  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0m";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Truncate description to a reasonable length
  const truncateDescription = (
    description: string | undefined,
    maxLength: number = 30
  ) => {
    if (!description) return "No description";
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength) + "...";
  };

  const handleResumeTimer = async () => {
    if (!lastEntry || !lastProject) return;

    try {
      await startTimer({
        projectId: lastEntry.projectId,
        taskId: lastEntry.taskId || undefined,
        description: lastEntry.description || undefined,
      });
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  // Don't show the component if there's no last entry, no project, timer is running, or currently loading
  if (!lastEntry || !lastProject || isRunning || loading) {
    return null;
  }

  return (
    <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-900">
              {lastProject.name}
            </h4>
            {(lastEntry.duration || 0) > 0 && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <ClockIcon className="h-3 w-3" />
                <span>{formatTime(lastEntry.duration || 0)}</span>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600">
            {lastTask && <span className="text-gray-500">{lastTask.name}</span>}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {truncateDescription(lastEntry.description)}
          </div>
        </div>
        <button
          onClick={handleResumeTimer}
          disabled={loading}
          className="ml-3 p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Resume this timer"
        >
          <PlayIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default ResumeLastTimer;
