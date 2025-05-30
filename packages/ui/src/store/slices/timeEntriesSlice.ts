import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { timeEntriesAPI } from "../../services/api";
import { fetchDashboardEarnings } from "./dashboardSlice";

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
    try {
      const response = await timeEntriesAPI.getCurrentEntry();
      // Handle API response format: {timeEntry: TimeEntry | null}
      if (response && typeof response === "object" && "timeEntry" in response) {
        return (response as any).timeEntry;
      }
      // Fallback for direct TimeEntry response (backward compatibility)
      return response;
    } catch (error: any) {
      // Handle 404 error gracefully - no current entry is not an error condition
      if (error.response?.status === 404) {
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  }
);

export const createTimeEntry = createAsyncThunk(
  "timeEntries/createTimeEntry",
  async (
    entryData: {
      description?: string;
      startTime: string;
      endTime: string;
      projectId?: string;
      taskId?: string;
    },
    { dispatch }
  ) => {
    const response = await timeEntriesAPI.createTimeEntry(entryData);
    // Refresh dashboard earnings after creating a time entry
    dispatch(fetchDashboardEarnings());
    return response;
  }
);

export const updateTimeEntry = createAsyncThunk(
  "timeEntries/updateTimeEntry",
  async (
    { id, data }: { id: string; data: Partial<TimeEntry> },
    { dispatch }
  ) => {
    const response = await timeEntriesAPI.updateTimeEntry(id, data);
    // Refresh dashboard earnings after updating a time entry
    dispatch(fetchDashboardEarnings());
    return response;
  }
);

export const deleteTimeEntry = createAsyncThunk(
  "timeEntries/deleteTimeEntry",
  async (id: string, { dispatch }) => {
    await timeEntriesAPI.deleteTimeEntry(id);
    // Refresh dashboard earnings after deleting a time entry
    dispatch(fetchDashboardEarnings());
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
        // Safely handle API response structure
        const response = action.payload || {};
        state.entries = response.entries || [];
        state.pagination = response.pagination || {
          page: 1,
          limit: 50,
          total: 0,
          pages: 0,
        };
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
