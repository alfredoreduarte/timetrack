import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { timeEntriesAPI, TimeEntry } from "../../services/api";

interface TimerState {
  isRunning: boolean;
  currentEntry: TimeEntry | null;
  elapsedTime: number;
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
      return await timeEntriesAPI.startTimer(data);
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
      return await timeEntriesAPI.stopTimer(entryId);
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
    try {
      const response = await timeEntriesAPI.getCurrentEntry();
      if (response && typeof response === "object" && "timeEntry" in response) {
        return (response as any).timeEntry;
      }
      return response;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }
);

const timerSlice = createSlice({
  name: "timer",
  initialState,
  reducers: {
    tick: (state) => {
      if (state.isRunning && state.currentEntry) {
        if (!Number.isFinite(state.elapsedTime)) {
          state.elapsedTime = 0;
        }
        state.elapsedTime += 1;
        state.currentEntry.duration = state.elapsedTime;
      }
    },
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
    timerStartedFromSocket: (state, action: PayloadAction<TimeEntry>) => {
      const entry = action.payload;
      state.isRunning = true;
      state.currentEntry = entry;
      if (entry.startTime) {
        const startTime = new Date(entry.startTime).getTime();
        const now = new Date().getTime();
        if (!isNaN(startTime) && !isNaN(now) && startTime <= now) {
          state.elapsedTime = Math.floor((now - startTime) / 1000);
        } else {
          state.elapsedTime = entry.duration || 0;
        }
      } else {
        state.elapsedTime = entry.duration || 0;
      }
    },
    timerStoppedFromSocket: (state) => {
      state.isRunning = false;
      state.currentEntry = null;
      state.elapsedTime = 0;
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
        state.isRunning = true;
        state.currentEntry = action.payload;
        state.elapsedTime = action.payload?.duration || 0;
      })
      .addCase(startTimer.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to start timer";
      })
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
      .addCase(fetchCurrentEntry.fulfilled, (state, action) => {
        if (action.payload) {
          state.isRunning = true;
          state.currentEntry = action.payload;
          const startTimeValue = action.payload.startTime;
          if (startTimeValue) {
            const startTime = new Date(startTimeValue).getTime();
            const now = new Date().getTime();
            if (!isNaN(startTime) && !isNaN(now) && startTime <= now) {
              state.elapsedTime = Math.floor((now - startTime) / 1000);
            } else {
              state.elapsedTime = action.payload.duration || 0;
            }
          } else {
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

export const {
  tick,
  syncTimer,
  resetTimer,
  clearError,
  timerStartedFromSocket,
  timerStoppedFromSocket,
} = timerSlice.actions;
export default timerSlice.reducer;
