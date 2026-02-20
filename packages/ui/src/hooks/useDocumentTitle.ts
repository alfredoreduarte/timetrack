import { useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";

const BASE_TITLE = "TimeTrack";

function formatTitleTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Updates the browser tab title to show the running timer.
 * Format when running: "1:23:45 - TimeTrack"
 * Format when idle: "TimeTrack"
 */
export function useDocumentTitle(): void {
  const isRunning = useSelector((state: RootState) => state.timer.isRunning);
  const elapsedTime = useSelector((state: RootState) => state.timer.elapsedTime);

  useEffect(() => {
    document.title = isRunning
      ? `${formatTitleTime(elapsedTime)} - ${BASE_TITLE}`
      : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [isRunning, elapsedTime]);
}
