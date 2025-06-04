import React from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { RootState } from "../store";
import { useTimer } from "../hooks/useTimer";
import { ClockIcon } from "@heroicons/react/24/outline";
import { StopIcon, PlayIcon } from "@heroicons/react/24/solid";

const TimerWidget: React.FC = () => {
  const navigate = useNavigate();
  const { projects } = useSelector((state: RootState) => state.projects);

  // Use centralized timer hook
  const {
    isRunning,
    currentEntry,
    elapsedTime,
    loading,
    stopTimer,
    formatTimeCompact,
  } = useTimer();

  const handleStopTimer = async () => {
    try {
      await stopTimer();
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  const handleStartTimer = () => {
    // Navigate to dashboard where user can start a timer
    navigate("/dashboard");
  };

  const handleTimerClick = () => {
    // Navigate to dashboard to see full timer interface
    navigate("/dashboard");
  };

  const currentProject = currentEntry?.projectId
    ? projects.find((p) => p.id === currentEntry.projectId)
    : null;

  if (!isRunning) {
    return (
      <button
        onClick={handleStartTimer}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        title="Start timer"
      >
        <PlayIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Start Timer</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Timer display - clickable to go to dashboard */}
      <button
        onClick={handleTimerClick}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors"
        title={`Timer running${
          currentProject ? ` - ${currentProject.name}` : ""
        }`}
      >
        <ClockIcon className="h-4 w-4 animate-pulse" />
        <span className="font-mono font-medium">
          {formatTimeCompact(elapsedTime)}
        </span>
        {currentProject && (
          <span className="hidden md:inline text-xs">
            - {currentProject.name}
          </span>
        )}
      </button>

      {/* Stop button */}
      <button
        onClick={handleStopTimer}
        disabled={loading}
        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
        title="Stop timer"
      >
        <StopIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export default TimerWidget;
