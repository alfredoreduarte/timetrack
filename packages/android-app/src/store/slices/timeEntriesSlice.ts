import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { timeEntriesAPI, TimeEntry } from "../../services/api";
import { fetchDashboardEarnings } from "./dashboardSlice";

export type { TimeEntry } from "../../services/api";

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
    return await timeEntriesAPI.getTimeEntries(params);
  }
);

export const fetchCurrentEntry = createAsyncThunk(
  "timeEntries/fetchCurrentEntry",
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
    dispatch(fetchDashboardEarnings());
    return response;
  }
);

export const deleteTimeEntry = createAsyncThunk(
  "timeEntries/deleteTimeEntry",
  async (id: string, { dispatch }) => {
    await timeEntriesAPI.deleteTimeEntry(id);
    dispatch(fetchDashboardEarnings());
    return id;
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
    entryCreatedFromSocket: (state, action: PayloadAction<TimeEntry>) => {
      if (!state.entries.find((e) => e.id === action.payload.id)) {
        state.entries.unshift(action.payload);
      }
    },
    entryUpdatedFromSocket: (state, action: PayloadAction<TimeEntry>) => {
      const entry = action.payload;
      const index = state.entries.findIndex((e) => e.id === entry.id);
      if (index !== -1) {
        state.entries[index] = entry;
      } else {
        state.entries.unshift(entry);
      }
      if (state.currentEntry?.id === entry.id) {
        state.currentEntry = entry;
      }
    },
    entryDeletedFromSocket: (state, action: PayloadAction<{ id: string }>) => {
      const { id } = action.payload;
      state.entries = state.entries.filter((e) => e.id !== id);
      if (state.currentEntry?.id === id) {
        state.currentEntry = null;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTimeEntries.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTimeEntries.fulfilled, (state, action) => {
        state.loading = false;
        const response = action.payload || {};
        const newEntries = response.entries || [];
        const pagination = response.pagination || {
          page: 1,
          limit: 50,
          total: 0,
          pages: 0,
        };
        // Append entries for subsequent pages, replace for page 1
        if (pagination.page > 1) {
          const existingIds = new Set(state.entries.map((e) => e.id));
          const uniqueNew = newEntries.filter((e: TimeEntry) => !existingIds.has(e.id));
          state.entries = [...state.entries, ...uniqueNew];
        } else {
          state.entries = newEntries;
        }
        state.pagination = pagination;
      })
      .addCase(fetchTimeEntries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch time entries";
      })
      .addCase(fetchCurrentEntry.fulfilled, (state, action) => {
        state.currentEntry = action.payload;
      })
      .addCase(createTimeEntry.fulfilled, (state, action) => {
        state.entries.unshift(action.payload);
      })
      .addCase(updateTimeEntry.fulfilled, (state, action) => {
        const index = state.entries.findIndex((e) => e.id === action.payload.id);
        if (index !== -1) {
          state.entries[index] = action.payload;
        }
        if (state.currentEntry?.id === action.payload.id) {
          state.currentEntry = action.payload;
        }
      })
      .addCase(deleteTimeEntry.fulfilled, (state, action) => {
        state.entries = state.entries.filter((e) => e.id !== action.payload);
        if (state.currentEntry?.id === action.payload) {
          state.currentEntry = null;
        }
      });
  },
});

export const {
  clearError,
  updateCurrentEntryDuration,
  entryCreatedFromSocket,
  entryUpdatedFromSocket,
  entryDeletedFromSocket,
} = timeEntriesSlice.actions;
export default timeEntriesSlice.reducer;
