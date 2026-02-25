import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "./useTypedDispatch";
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

export const useTimer = () => {
  const dispatch = useAppDispatch();
  const { isRunning, currentEntry, elapsedTime, loading, error } =
    useAppSelector((state) => state.timer);

  // Timer tick effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRunning) {
      interval = setInterval(() => {
        dispatch(tick());
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, dispatch]);

  // Timer sync effect
  useEffect(() => {
    let syncInterval: ReturnType<typeof setInterval>;
    if (isRunning && currentEntry) {
      dispatch(syncTimer());
      syncInterval = setInterval(() => {
        dispatch(syncTimer());
      }, 30000);
    }
    return () => {
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isRunning, currentEntry, dispatch]);

  const startTimer = useCallback(
    async (params: StartTimerParams): Promise<void> => {
      await dispatch(startTimerAction(params)).unwrap();
      dispatch(fetchDashboardEarnings());
      dispatch(fetchTimeEntries({ limit: 10 }));
    },
    [dispatch]
  );

  const stopTimer = useCallback(async (): Promise<void> => {
    if (!currentEntry) return;
    await dispatch(stopTimerAction(currentEntry.id)).unwrap();
    dispatch(fetchDashboardEarnings());
    dispatch(fetchTimeEntries({ limit: 10 }));
  }, [dispatch, currentEntry]);

  const initializeTimer = useCallback(async (): Promise<void> => {
    try {
      await dispatch(fetchCurrentEntry()).unwrap();
    } catch {
      // Initialization failure is not critical
    }
  }, [dispatch]);

  const formatTime = useCallback((seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  return {
    isRunning,
    currentEntry,
    elapsedTime,
    loading,
    error,
    startTimer,
    stopTimer,
    initializeTimer,
    formatTime,
  };
};
