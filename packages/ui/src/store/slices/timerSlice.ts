import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { timeEntriesAPI } from "../../services/api";
import { TimeEntry } from "./timeEntriesSlice";

interface TimerState {
  // Source of truth: all currently running timers, most recently started first.
  // Multiple concurrent timers are allowed so parallel AI sessions on different
  // projects each get their own row.
  runningEntries: TimeEntry[];
  // Per-entry live elapsed seconds, driven by tick/syncTimer.
  elapsedById: Record<string, number>;

  // Backwards-compat mirrors of the most recent running entry. Old consumers
  // (Timer widget, header, electron display) keep reading these unchanged.
  isRunning: boolean;
  currentEntry: TimeEntry | null;
  elapsedTime: number;

  loading: boolean;
  fetchingCurrentEntry: boolean;
  error: string | null;
}

const initialState: TimerState = {
  runningEntries: [],
  elapsedById: {},
  isRunning: false,
  currentEntry: null,
  elapsedTime: 0,
  loading: false,
  fetchingCurrentEntry: false,
  error: null,
};

const elapsedFromStart = (entry: TimeEntry): number => {
  if (!entry.startTime) return entry.duration || 0;
  const start = new Date(entry.startTime).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(now) || start > now) {
    return entry.duration || 0;
  }
  return Math.floor((now - start) / 1000);
};

const syncMirrors = (state: TimerState) => {
  const primary = state.runningEntries[0] ?? null;
  state.currentEntry = primary;
  state.isRunning = !!primary;
  state.elapsedTime = primary ? state.elapsedById[primary.id] ?? 0 : 0;
};

// Async thunks
export const startTimer = createAsyncThunk(
  "timer/startTimer",
  async (
    data: {
      projectId?: string;
      taskId?: string;
      description?: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await timeEntriesAPI.startTimer(data);
      return response as TimeEntry;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to start timer"
      );
    }
  }
);

export const stopTimer = createAsyncThunk(
  "timer/stopTimer",
  async (entryId: string, { rejectWithValue }) => {
    try {
      const response = await timeEntriesAPI.stopTimer(entryId);
      return { entryId, response };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to stop timer"
      );
    }
  }
);

export const fetchRunningEntries = createAsyncThunk(
  "timer/fetchRunningEntries",
  async () => {
    const response = await timeEntriesAPI.getRunningEntries();
    return response as TimeEntry[];
  },
  {
    condition: (_, { getState }) => {
      const { timer } = getState() as { timer: TimerState };
      return !timer.fetchingCurrentEntry;
    },
  }
);

// Legacy alias — older code dispatches fetchCurrentEntry on focus etc.
export const fetchCurrentEntry = fetchRunningEntries;

const timerSlice = createSlice({
  name: "timer",
  initialState,
  reducers: {
    tick: (state) => {
      for (const entry of state.runningEntries) {
        const prev = state.elapsedById[entry.id];
        const next = Number.isFinite(prev) ? prev + 1 : 1;
        state.elapsedById[entry.id] = next;
      }
      syncMirrors(state);
      if (state.currentEntry) {
        state.currentEntry.duration = state.elapsedTime;
      }
    },
    syncTimer: (state) => {
      for (const entry of state.runningEntries) {
        state.elapsedById[entry.id] = elapsedFromStart(entry);
      }
      syncMirrors(state);
      if (state.currentEntry) {
        state.currentEntry.duration = state.elapsedTime;
      }
    },
    resetTimer: (state) => {
      state.runningEntries = [];
      state.elapsedById = {};
      state.currentEntry = null;
      state.isRunning = false;
      state.elapsedTime = 0;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    // Socket event reducers
    timerStartedFromSocket: (state, action: PayloadAction<TimeEntry>) => {
      const entry = action.payload;
      if (!state.runningEntries.find((e) => e.id === entry.id)) {
        state.runningEntries.unshift(entry);
      }
      state.elapsedById[entry.id] = elapsedFromStart(entry);
      syncMirrors(state);
    },
    timerStoppedFromSocket: (
      state,
      action: PayloadAction<{ id?: string } | undefined>
    ) => {
      const id = action.payload?.id;
      if (id) {
        state.runningEntries = state.runningEntries.filter((e) => e.id !== id);
        delete state.elapsedById[id];
      } else {
        // No id — clear everything (legacy event shape).
        state.runningEntries = [];
        state.elapsedById = {};
      }
      syncMirrors(state);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startTimer.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(startTimer.fulfilled, (state, action) => {
        state.loading = false;
        const entry = action.payload;
        if (entry && !state.runningEntries.find((e) => e.id === entry.id)) {
          state.runningEntries.unshift(entry);
        }
        if (entry) {
          state.elapsedById[entry.id] = entry.duration || 0;
        }
        syncMirrors(state);
      })
      .addCase(startTimer.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to start timer";
      })
      .addCase(stopTimer.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(stopTimer.fulfilled, (state, action) => {
        state.loading = false;
        const id = action.payload.entryId;
        state.runningEntries = state.runningEntries.filter((e) => e.id !== id);
        delete state.elapsedById[id];
        syncMirrors(state);
      })
      .addCase(stopTimer.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to stop timer";
      })
      .addCase(fetchRunningEntries.pending, (state) => {
        state.fetchingCurrentEntry = true;
      })
      .addCase(fetchRunningEntries.rejected, (state) => {
        state.fetchingCurrentEntry = false;
      })
      .addCase(fetchRunningEntries.fulfilled, (state, action) => {
        state.fetchingCurrentEntry = false;
        const entries = Array.isArray(action.payload) ? action.payload : [];
        state.runningEntries = entries;
        const next: Record<string, number> = {};
        for (const entry of entries) {
          next[entry.id] = elapsedFromStart(entry);
        }
        state.elapsedById = next;
        syncMirrors(state);
      });
  },
});

export const {
  tick,
  syncTimer,
  resetTimer,
  clearError,
  timerStartedFromSocket,
  timerStoppedFromSocket,
} = timerSlice.actions;

// Selectors
import type { RootState } from "../index";
export const selectRunningEntries = (s: RootState) => s.timer.runningEntries;
export const selectElapsedFor = (id: string) => (s: RootState) =>
  s.timer.elapsedById[id] ?? 0;

export default timerSlice.reducer;
