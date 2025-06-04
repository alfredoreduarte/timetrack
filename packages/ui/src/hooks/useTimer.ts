import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store";
import {
  startTimer as startTimerAction,
  stopTimer as stopTimerAction,
  tick,
  syncTimer,
  fetchCurrentEntry,
} from "../store/slices/timerSlice";
import { fetchDashboardEarnings } from "../store/slices/dashboardSlice";
import { fetchTimeEntries } from "../store/slices/timeEntriesSlice";

interface StartTimerParams {
  projectId?: string;
  taskId?: string;
  description?: string;
}

interface UseTimerReturn {
  // State
  isRunning: boolean;
  currentEntry: any;
  elapsedTime: number;
  loading: boolean;
  error: string | null;

  // Actions
  startTimer: (params: StartTimerParams) => Promise<void>;
  stopTimer: () => Promise<void>;
  initializeTimer: () => Promise<void>;

  // Utils
  formatTime: (seconds: number) => string;
  formatTimeCompact: (seconds: number) => string;
}

/**
 * Centralized timer hook that manages all timer operations and side effects
 * This is the single source of truth for timer functionality across the app
 */
export const useTimer = (): UseTimerReturn => {
  const dispatch = useDispatch<AppDispatch>();
  const { isRunning, currentEntry, elapsedTime, loading, error } = useSelector(
    (state: RootState) => state.timer
  );

  // Timer tick effect - only one instance across the app
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

  // Timer synchronization - only one instance across the app
  useEffect(() => {
    let syncInterval: NodeJS.Timeout;
    if (isRunning && currentEntry) {
      // Sync immediately when timer starts or current entry changes
      dispatch(syncTimer());

      // Then sync every 30 seconds
      syncInterval = setInterval(() => {
        dispatch(syncTimer());
      }, 30000);
    }
    return () => {
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isRunning, currentEntry, dispatch]);

  // Start timer with all necessary side effects
  const startTimer = useCallback(
    async (params: StartTimerParams): Promise<void> => {
      try {
        await dispatch(startTimerAction(params)).unwrap();

        // Handle all side effects automatically
        dispatch(fetchDashboardEarnings());
        dispatch(fetchTimeEntries({ limit: 10 })); // Refresh recent entries
      } catch (error) {
        console.error("Failed to start timer:", error);
        throw error; // Re-throw so components can handle if needed
      }
    },
    [dispatch]
  );

  // Stop timer with all necessary side effects
  const stopTimer = useCallback(async (): Promise<void> => {
    if (!currentEntry) {
      console.warn("No current entry to stop");
      return;
    }

    try {
      await dispatch(stopTimerAction(currentEntry.id)).unwrap();

      // Handle all side effects automatically
      dispatch(fetchDashboardEarnings());
      dispatch(fetchTimeEntries({ limit: 10 })); // Refresh recent entries
    } catch (error) {
      console.error("Failed to stop timer:", error);
      throw error; // Re-throw so components can handle if needed
    }
  }, [dispatch, currentEntry]);

  // Initialize timer (fetch current entry if any)
  const initializeTimer = useCallback(async (): Promise<void> => {
    try {
      await dispatch(fetchCurrentEntry()).unwrap();
    } catch (error) {
      console.error("Failed to initialize timer:", error);
      // Don't throw here as this is initialization and shouldn't break the app
    }
  }, [dispatch]);

  // Standard time formatting (HH:MM:SS)
  const formatTime = useCallback((seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "00:00:00";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // Compact time formatting (M:SS or H:MM:SS)
  const formatTimeCompact = useCallback((seconds: number): string => {
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
  }, []);

  return {
    // State
    isRunning,
    currentEntry,
    elapsedTime,
    loading,
    error,

    // Actions
    startTimer,
    stopTimer,
    initializeTimer,

    // Utils
    formatTime,
    formatTimeCompact,
  };
};
