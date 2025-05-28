import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { timeEntriesAPI } from "../../services/api";
import { TimeEntry } from "./timeEntriesSlice";

interface TimerState {
  isRunning: boolean;
  currentEntry: TimeEntry | null;
  elapsedTime: number; // in seconds
  loading: boolean;
  error: string | null;
}

const initialState: TimerState = {
  isRunning: false,
  currentEntry: null,
  elapsedTime: 0,
  loading: false,
  error: null,
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
      return response;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to start timer"
      );
    }
  }
);

export const stopTimer = createAsyncThunk(
  "timer/stopTimer",
  async (entryId: string, { rejectWithValue }) => {
    try {
      const response = await timeEntriesAPI.stopTimer(entryId);
      return response;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to stop timer"
      );
    }
  }
);

export const fetchCurrentEntry = createAsyncThunk(
  "timer/fetchCurrentEntry",
  async () => {
    const response = await timeEntriesAPI.getCurrentEntry();
    // Handle API response format: {timeEntry: TimeEntry} or TimeEntry | null
    if (response && typeof response === "object" && "timeEntry" in response) {
      return (response as any).timeEntry;
    }
    return response;
  }
);

const timerSlice = createSlice({
  name: "timer",
  initialState,
  reducers: {
    tick: (state) => {
      if (state.isRunning && state.currentEntry) {
        // Ensure elapsedTime is a valid number before incrementing
        if (!Number.isFinite(state.elapsedTime)) {
          state.elapsedTime = 0;
        }
        state.elapsedTime += 1;
        state.currentEntry.duration = state.elapsedTime;
      }
    },
    // Add a new action to sync timer with current time
    syncTimer: (state) => {
      if (
        state.isRunning &&
        state.currentEntry &&
        state.currentEntry.startTime
      ) {
        const startTime = new Date(state.currentEntry.startTime).getTime();
        const now = new Date().getTime();
        if (!isNaN(startTime) && !isNaN(now) && startTime <= now) {
          state.elapsedTime = Math.floor((now - startTime) / 1000);
          state.currentEntry.duration = state.elapsedTime;
        }
      }
    },
    resetTimer: (state) => {
      state.isRunning = false;
      state.currentEntry = null;
      state.elapsedTime = 0;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Start timer
      .addCase(startTimer.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(startTimer.fulfilled, (state, action) => {
        state.loading = false;
        state.isRunning = true;
        state.currentEntry = action.payload;
        state.elapsedTime = action.payload?.duration || 0;
      })
      .addCase(startTimer.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to start timer";
      })
      // Stop timer
      .addCase(stopTimer.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(stopTimer.fulfilled, (state) => {
        state.loading = false;
        state.isRunning = false;
        state.currentEntry = null;
        state.elapsedTime = 0;
      })
      .addCase(stopTimer.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to stop timer";
      })
      // Fetch current entry
      .addCase(fetchCurrentEntry.fulfilled, (state, action) => {
        if (action.payload) {
          state.isRunning = true;
          state.currentEntry = action.payload;
          // Calculate elapsed time from start time with proper validation
          const startTimeValue = action.payload.startTime;

          if (startTimeValue) {
            const startTime = new Date(startTimeValue).getTime();
            const now = new Date().getTime();

            // Validate that both dates are valid numbers
            if (!isNaN(startTime) && !isNaN(now) && startTime <= now) {
              const calculatedElapsed = Math.floor((now - startTime) / 1000);
              state.elapsedTime = calculatedElapsed;
            } else {
              // Fallback to duration from payload or 0
              state.elapsedTime = action.payload.duration || 0;
            }
          } else {
            // No start time, use duration from payload or 0
            state.elapsedTime = action.payload.duration || 0;
          }
        } else {
          state.isRunning = false;
          state.currentEntry = null;
          state.elapsedTime = 0;
        }
      });
  },
});

export const { tick, syncTimer, resetTimer, clearError } = timerSlice.actions;
export default timerSlice.reducer;
