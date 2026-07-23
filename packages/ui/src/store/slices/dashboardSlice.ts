import { createSlice, createAsyncThunk, createSelector } from "@reduxjs/toolkit";
import { authAPI } from "../../services/api";
import type { RootState } from "../index";
import type { TimeEntry } from "./timeEntriesSlice";

export interface DashboardEarnings {
  currentTimer: {
    earnings: number;
    duration: number;
    isRunning: boolean;
    hourlyRate: number;
  };
  today: {
    earnings: number;
    duration: number;
  };
  thisWeek: {
    earnings: number;
    duration: number;
  };
}

interface DashboardState {
  earnings: DashboardEarnings | null;
  loading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  earnings: null,
  loading: false,
  error: null,
};

// Async thunks
export const fetchDashboardEarnings = createAsyncThunk(
  "dashboard/fetchEarnings",
  async (_, { rejectWithValue }) => {
    try {
      const response = await authAPI.getDashboardEarnings();
      return response.earnings;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || "Failed to fetch dashboard earnings"
      );
    }
  },
  {
    condition: (_, { getState }) => {
      const { dashboard } = getState() as { dashboard: DashboardState };
      // Skip if already loading — prevents duplicate concurrent requests
      return !dashboard.loading;
    },
  }
);

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardEarnings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardEarnings.fulfilled, (state, action) => {
        state.loading = false;
        state.earnings = action.payload;
      })
      .addCase(fetchDashboardEarnings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError } = dashboardSlice.actions;
export default dashboardSlice.reducer;

// ---------------------------------------------------------------------------
// Live earnings
//
// The API's today/thisWeek totals only sum *stopped* entries — a running timer
// is reported separately as `currentTimer`. To make Today and This Week tick up
// live (like Earning Now) we fold each running timer's live earnings back into
// those totals, deriving the live portion from wall-clock elapsed rather than
// accumulating it. That derivation is idempotent: it doesn't matter how many
// components subscribe or how often the selector recomputes, the value only
// depends on the current time — the same property that fixed the "N seconds per
// second" tick bug. It also sums across *all* running timers, so concurrent
// timers each contribute exactly once.
//
// The running-timer deltas are bucketed to match the API's own filters (start
// day/week, and project-attached only) so the amount a timer contributes is the
// same before and after it stops — the only movement at stop is the brief lag
// while the base total refetches from the server.
// ---------------------------------------------------------------------------

export interface LiveEarnings {
  today: number;
  thisWeek: number;
  currentTimer: number;
  isRunning: boolean;
  // True when at least one running timer has a positive rate — i.e. money is
  // actively being earned right now. Drives the "Earning Now" card so it shows
  // immediately on start rather than waiting for the first tick.
  isEarning: boolean;
}

// Start of the local day, in ms. The browser's local timezone is the one sent
// to /dashboard-earnings, so this lines up with the server's day bucketing.
const startOfLocalDay = (nowMs: number): number => {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Start of the local week (Monday), in ms — mirrors getStartOfWeekInTimezone on
// the API so a running timer buckets into "this week" exactly as it will once
// it's stopped and folded into the fetched total.
const startOfLocalWeek = (nowMs: number): number => {
  const d = new Date(nowMs);
  const dayOfWeek = d.getDay(); // 0 = Sunday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysToMonday);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Pure: base (stopped) earnings + each running timer's live earnings. Each
// timer's day/week contribution is bucketed by when it *started*, matching how
// the API will bucket the entry once it stops — so the amount it accounts for
// doesn't jump across the stop.
export const computeLiveEarnings = (
  earnings: DashboardEarnings | null,
  runningEntries: TimeEntry[],
  elapsedById: Record<string, number>,
  nowMs: number
): LiveEarnings => {
  const dayStart = startOfLocalDay(nowMs);
  const weekStart = startOfLocalWeek(nowMs);

  let todayDelta = 0;
  let weekDelta = 0;
  let currentTimer = 0;
  let isEarning = false;

  for (const entry of runningEntries) {
    const rate = entry.hourlyRateSnapshot ?? 0;
    if (!rate) continue;
    isEarning = true;

    const elapsed = elapsedById[entry.id] ?? 0;
    const live = (rate * elapsed) / 3600;
    // Earning Now mirrors the API's currentTimer query, which has no project
    // filter — so every paid running timer counts here.
    currentTimer += live;

    // Today / This Week only sum project-attached entries, because the API's
    // today/thisWeek queries filter `projectId: not null`. A project-less timer
    // still earns at the user's default rate, but folding it into these totals
    // would make it vanish the instant it stops and the base refetches (the
    // server never counts it there). Keep it out to stay consistent.
    const hasProject = !!(entry.project || entry.projectId);
    if (!hasProject) continue;

    const startMs = entry.startTime ? new Date(entry.startTime).getTime() : NaN;
    if (Number.isFinite(startMs)) {
      if (startMs >= dayStart) todayDelta += live;
      if (startMs >= weekStart) weekDelta += live;
    }
  }

  return {
    today: (earnings?.today?.earnings ?? 0) + todayDelta,
    thisWeek: (earnings?.thisWeek?.earnings ?? 0) + weekDelta,
    currentTimer,
    isRunning: runningEntries.length > 0,
    isEarning,
  };
};

export const selectLiveEarnings = createSelector(
  [
    (s: RootState) => s.dashboard.earnings,
    (s: RootState) => s.timer.runningEntries,
    (s: RootState) => s.timer.elapsedById,
  ],
  (earnings, runningEntries, elapsedById) =>
    computeLiveEarnings(earnings, runningEntries, elapsedById, Date.now())
);
