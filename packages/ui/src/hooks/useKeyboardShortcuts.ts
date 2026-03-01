import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store";
import {
  stopTimer as stopTimerAction,
} from "../store/slices/timerSlice";
import { fetchDashboardEarnings } from "../store/slices/dashboardSlice";
import { fetchTimeEntries } from "../store/slices/timeEntriesSlice";

// --- Shortcut data (shared with KeyboardShortcutsModal) ---

export interface ShortcutEntry {
  keys: string[];
  action: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const isMac =
  typeof navigator !== "undefined" &&
  ((navigator as any).userAgentData?.platform === "macOS" ||
    navigator.platform?.toUpperCase().includes("MAC"));

export const modifierLabel = isMac ? "\u2318" : "Ctrl";

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Timer",
    shortcuts: [
      { keys: ["Space"], action: "Stop running timer" },
      { keys: ["N"], action: "New time entry" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["D"], action: "Go to Dashboard" },
      { keys: ["P"], action: "Go to Projects" },
      { keys: ["T"], action: "Go to Time Entries" },
      { keys: ["R"], action: "Go to Reports" },
      { keys: ["S"], action: "Go to Settings" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: ["?"], action: "Show this help" },
      { keys: ["Esc"], action: "Close modal / dropdown" },
    ],
  },
];

// --- Helpers ---

function isEditableElementFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if ((el as HTMLElement).isContentEditable) {
    return true;
  }
  return false;
}

const NAV_KEYS: Record<string, string> = {
  d: "/dashboard",
  p: "/projects",
  t: "/time-entries",
  r: "/reports",
  s: "/settings",
};

// --- Hook ---

export interface UseKeyboardShortcutsReturn {
  isHelpModalOpen: boolean;
  setIsHelpModalOpen: (open: boolean) => void;
}

export function useKeyboardShortcuts(): UseKeyboardShortcutsReturn {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  // Read timer state directly from Redux to avoid duplicate tick/sync intervals
  const { isRunning, currentEntry } = useSelector(
    (state: RootState) => state.timer
  );

  const handleStopTimer = useCallback(async () => {
    if (!currentEntry) return;
    try {
      await dispatch(stopTimerAction(currentEntry.id)).unwrap();
      dispatch(fetchDashboardEarnings());
      dispatch(fetchTimeEntries({ limit: 10 }));
    } catch (error) {
      console.error("Failed to stop timer:", error);
    }
  }, [dispatch, currentEntry]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key;

      // --- Always-active shortcuts ---

      if (key === "Escape") {
        if (isHelpModalOpen) {
          setIsHelpModalOpen(false);
        }
        return;
      }

      if (key === "?" || (key === "/" && e.shiftKey)) {
        if (isEditableElementFocused()) return;
        e.preventDefault();
        setIsHelpModalOpen((prev) => !prev);
        return;
      }

      // --- Shortcuts suppressed when typing in form fields ---
      if (isEditableElementFocused()) return;

      // Skip if any modifier key is held (allow browser/OS shortcuts through)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Single-key navigation
      const navPath = NAV_KEYS[key.toLowerCase()];
      if (navPath) {
        navigate(navPath);
        return;
      }

      // Stop timer (Space only stops; starting requires project selection in the UI)
      if (key === " ") {
        e.preventDefault(); // Prevent page scroll
        if (isRunning) {
          handleStopTimer();
        }
        return;
      }

      // New time entry — navigate to time entries and scroll to Quick Timer
      if (key.toLowerCase() === "n") {
        navigate("/time-entries");
        // Scroll to top after navigation so the Quick Timer form is visible
        requestAnimationFrame(() => window.scrollTo(0, 0));
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRunning, handleStopTimer, navigate, isHelpModalOpen]);

  return { isHelpModalOpen, setIsHelpModalOpen };
}
