import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import { useTimer } from "../../hooks/useTimer";
import { ClockIcon } from "@heroicons/react/24/outline";
import { StopIcon } from "@heroicons/react/24/solid";

const ElectronTimerDisplay: React.FC = () => {
  const { projects, tasks } = useSelector((state: RootState) => state.projects);
  const {
    isRunning,
    currentEntry,
    elapsedTime,
    stopTimer,
    formatTime,
    loading,
  } = useTimer();

  const handleStopTimer = async () => {
    try {
      await stopTimer();
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  if (!isRunning || !currentEntry) {
    return null;
  }

  const currentProject = projects.find((p) => p.id === currentEntry.projectId);
  const currentTask = currentEntry.taskId
    ? tasks.find((t) => t.id === currentEntry.taskId)
    : null;

  return (
    <div className="p-4 border-b border-gray-200 bg-green-50">
      {/* Timer Display */}
      <div className="text-center mb-3">
        <div className="text-2xl font-mono font-bold text-green-700 mb-1">
          {formatTime(elapsedTime)}
        </div>
        <div className="flex items-center justify-center gap-1 text-green-600">
          <ClockIcon className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Timer running</span>
        </div>
      </div>

      {/* Project Info */}
      <div className="text-center mb-3">
        {currentProject && (
          <div className="text-sm font-medium text-gray-900 mb-1">
            {currentProject.name}
          </div>
        )}
        {currentTask && (
          <div className="text-xs text-gray-600 mb-1">{currentTask.name}</div>
        )}
        {currentEntry.description && (
          <div className="text-xs text-gray-500 break-words">
            {currentEntry.description}
          </div>
        )}
      </div>

      {/* Stop Button */}
      <button
        onClick={handleStopTimer}
        disabled={loading}
        className="no-drag w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <StopIcon className="h-4 w-4" />
        {loading ? "Stopping..." : "Stop Timer"}
      </button>
    </div>
  );
};

export default ElectronTimerDisplay;
