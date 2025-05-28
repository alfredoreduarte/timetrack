import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { AppDispatch, RootState } from "../store";
import { stopTimer, tick, syncTimer } from "../store/slices/timerSlice";
import { PlayIcon, StopIcon, ClockIcon } from "@heroicons/react/24/outline";

const TimerWidget: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { isRunning, currentEntry, elapsedTime, loading } = useSelector(
    (state: RootState) => state.timer
  );
  const { projects } = useSelector((state: RootState) => state.projects);

  // Format time display (compact version)
  const formatTime = (seconds: number): string => {
    // Validate input to prevent NaN display
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Timer tick effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        dispatch(tick());
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, dispatch]);

  // Timer initialization is now handled at the app level to avoid race conditions

  // Sync timer when current entry changes or component mounts
  useEffect(() => {
    if (isRunning && currentEntry) {
      dispatch(syncTimer());
    }
  }, [isRunning, currentEntry, dispatch]);

  // Sync timer with server time periodically (every 30 seconds)
  useEffect(() => {
    let syncInterval: NodeJS.Timeout;
    if (isRunning) {
      syncInterval = setInterval(() => {
        dispatch(syncTimer());
      }, 30000); // Sync every 30 seconds
    }
    return () => {
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isRunning, dispatch]);

  const handleStopTimer = async () => {
    if (currentEntry) {
      try {
        await dispatch(stopTimer(currentEntry.id)).unwrap();
      } catch (error) {
        console.error("Failed to stop timer:", error);
      }
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
        <span className="font-mono font-medium">{formatTime(elapsedTime)}</span>
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
