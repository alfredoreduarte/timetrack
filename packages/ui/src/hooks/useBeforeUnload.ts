import { useEffect } from "react";
import { store } from "../store";

/**
 * Warns users before closing/refreshing the tab while a timer is running.
 * Uses store.getState() directly to avoid stale closure issues.
 * Only attaches the listener while the component is mounted (browser-only via BrowserEffects).
 */
export function useBeforeUnload(): void {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (store.getState().timer.isRunning) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}
