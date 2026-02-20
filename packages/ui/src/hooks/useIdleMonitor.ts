import { useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import { store, RootState } from "../store";
import { stopTimer } from "../store/slices/timerSlice";
import { fetchDashboardEarnings } from "../store/slices/dashboardSlice";
import { fetchTimeEntries } from "../store/slices/timeEntriesSlice";
import toast from "react-hot-toast";

/**
 * Timestamp of the most recent idle-triggered stop. Used by AppContent's
 * visibility handler to avoid racing with the idle monitor (syncing timer
 * state right after the idle monitor stopped it).
 */
let lastIdleStopAt = 0;

/** Returns true if the idle monitor stopped the timer within the last 3 seconds. */
export function wasRecentlyIdleStopped(): boolean {
  return Date.now() - lastIdleStopAt < 3000;
}

/**
 * Monitors user activity and auto-stops the timer after the configured
 * idle timeout. Tracks mousemove, keydown, mousedown, scroll, and
 * touchstart events within the browser tab.
 *
 * Only evaluates idle state when the tab is visible (prevents false
 * positives when working in other apps). When returning to a tab
 * that was hidden longer than the idle threshold, auto-stops the timer.
 */
export function useIdleMonitor(): void {
  const isRunning = useSelector((state: RootState) => state.timer.isRunning);
  const idleTimeoutSeconds = useSelector(
    (state: RootState) => state.auth.user?.idleTimeoutSeconds ?? 0
  );

  const lastActivityRef = useRef<number>(Date.now());
  const hiddenSinceRef = useRef<number | null>(null);
  const hasStoppedRef = useRef(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const handleIdleStop = useCallback(
    (idleMs: number) => {
      // Prevent double-stopping (e.g., interval fires + visibility fires)
      if (hasStoppedRef.current) return;

      const state = store.getState();
      const currentEntry = state.timer.currentEntry;
      if (!currentEntry || !state.timer.isRunning) return;

      hasStoppedRef.current = true;
      lastIdleStopAt = Date.now();
      const idleMinutes = Math.round(idleMs / 60000);

      store.dispatch(stopTimer(currentEntry.id)).then(() => {
        store.dispatch(fetchDashboardEarnings());
        store.dispatch(fetchTimeEntries({ limit: 10 }));
      });

      toast(
        `Timer stopped due to inactivity${idleMinutes > 0 ? ` (${idleMinutes} min)` : ""}`,
        { duration: 15000 }
      );
    },
    // Empty deps: reads store.getState() directly to avoid stale closures,
    // same pattern as useBeforeUnload.
    []
  );

  useEffect(() => {
    if (!isRunning || !idleTimeoutSeconds) return;

    // Reset stop guard when effect re-runs (timer started again)
    hasStoppedRef.current = false;
    resetActivity();

    const events = [
      "mousemove",
      "keydown",
      "mousedown",
      "scroll",
      "touchstart",
    ];
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const throttledReset = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        resetActivity();
      }, 1000);
    };

    events.forEach((event) =>
      document.addEventListener(event, throttledReset, { passive: true })
    );

    // Check idle state every 10 seconds (only when tab is visible)
    const checkInterval = setInterval(() => {
      if (document.hidden) return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= idleTimeoutSeconds * 1000) {
        handleIdleStop(idleMs);
      }
    }, 10000);

    // Handle returning to a tab after being away longer than idle threshold
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else {
        if (hiddenSinceRef.current) {
          const awayMs = Date.now() - hiddenSinceRef.current;
          if (awayMs >= idleTimeoutSeconds * 1000) {
            handleIdleStop(awayMs);
          }
          hiddenSinceRef.current = null;
        }
        resetActivity();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      events.forEach((e) => document.removeEventListener(e, throttledReset));
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(checkInterval);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [isRunning, idleTimeoutSeconds, resetActivity, handleIdleStop]);
}
