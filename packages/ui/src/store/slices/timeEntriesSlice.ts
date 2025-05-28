import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { timeEntriesAPI } from "../../services/api";

export interface TimeEntry {
  id: string;
  description?: string;
  startTime: string;
  endTime?: string;
  duration: number; // in seconds
  projectId?: string;
  taskId?: string;
  userId: string;
  project?: {
    id: string;
    name: string;
    color?: string;
  };
  task?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface TimeEntriesState {
  entries: TimeEntry[];
  currentEntry: TimeEntry | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  loading: boolean;
  error: string | null;
}

const initialState: TimeEntriesState = {
  entries: [],
  currentEntry: null,
  pagination: {
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
  },
  loading: false,
  error: null,
};

// Async thunks
export const fetchTimeEntries = createAsyncThunk(
  "timeEntries/fetchTimeEntries",
  async (
    params: {
      startDate?: string;
      endDate?: string;
      projectId?: string;
      page?: number;
      limit?: number;
    } = {}
  ) => {
    const response = await timeEntriesAPI.getTimeEntries(params);
    return response;
  }
);

export const fetchCurrentEntry = createAsyncThunk(
  "timeEntries/fetchCurrentEntry",
  async () => {
    const response = await timeEntriesAPI.getCurrentEntry();
    return response;
  }
);

export const createTimeEntry = createAsyncThunk(
  "timeEntries/createTimeEntry",
  async (entryData: {
    description?: string;
    startTime: string;
    endTime: string;
    projectId?: string;
    taskId?: string;
  }) => {
    const response = await timeEntriesAPI.createTimeEntry(entryData);
    return response;
  }
);

export const updateTimeEntry = createAsyncThunk(
  "timeEntries/updateTimeEntry",
  async ({ id, data }: { id: string; data: Partial<TimeEntry> }) => {
    const response = await timeEntriesAPI.updateTimeEntry(id, data);
    return response;
  }
);

export const deleteTimeEntry = createAsyncThunk(
  "timeEntries/deleteTimeEntry",
  async (id: string) => {
    await timeEntriesAPI.deleteTimeEntry(id);
    return id;
  }
);

export const startTimer = createAsyncThunk(
  "timeEntries/startTimer",
  async (data: {
    projectId?: string;
    taskId?: string;
    description?: string;
  }) => {
    const response = await timeEntriesAPI.startTimer(data);
    return response;
  }
);

export const stopTimer = createAsyncThunk(
  "timeEntries/stopTimer",
  async (id: string) => {
    const response = await timeEntriesAPI.stopTimer(id);
    return response;
  }
);

const timeEntriesSlice = createSlice({
  name: "timeEntries",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateCurrentEntryDuration: (state, action: PayloadAction<number>) => {
      if (state.currentEntry) {
        state.currentEntry.duration = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch time entries
      .addCase(fetchTimeEntries.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTimeEntries.fulfilled, (state, action) => {
        state.loading = false;
        state.entries = action.payload.entries;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchTimeEntries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch time entries";
      })
      // Fetch current entry
      .addCase(fetchCurrentEntry.fulfilled, (state, action) => {
        state.currentEntry = action.payload;
      })
      // Create time entry
      .addCase(createTimeEntry.fulfilled, (state, action) => {
        state.entries.unshift(action.payload);
      })
      // Update time entry
      .addCase(updateTimeEntry.fulfilled, (state, action) => {
        const index = state.entries.findIndex(
          (e) => e.id === action.payload.id
        );
        if (index !== -1) {
          state.entries[index] = action.payload;
        }
        if (state.currentEntry?.id === action.payload.id) {
          state.currentEntry = action.payload;
        }
      })
      // Delete time entry
      .addCase(deleteTimeEntry.fulfilled, (state, action) => {
        state.entries = state.entries.filter((e) => e.id !== action.payload);
        if (state.currentEntry?.id === action.payload) {
          state.currentEntry = null;
        }
      })
      // Start timer
      .addCase(startTimer.fulfilled, (state, action) => {
        state.currentEntry = action.payload;
        state.entries.unshift(action.payload);
      })
      // Stop timer
      .addCase(stopTimer.fulfilled, (state, action) => {
        const index = state.entries.findIndex(
          (e) => e.id === action.payload.id
        );
        if (index !== -1) {
          state.entries[index] = action.payload;
        }
        state.currentEntry = null;
      });
  },
});

export const { clearError, updateCurrentEntryDuration } =
  timeEntriesSlice.actions;
export default timeEntriesSlice.reducer;
