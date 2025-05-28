import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { authAPI } from "../../services/api";

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
  }
);

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateCurrentTimerEarnings: (state, action) => {
      if (state.earnings?.currentTimer.isRunning) {
        const { duration, hourlyRate } = action.payload;
        state.earnings.currentTimer.duration = duration;
        state.earnings.currentTimer.earnings = (hourlyRate * duration) / 3600;
      }
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

export const { clearError, updateCurrentTimerEarnings } =
  dashboardSlice.actions;
export default dashboardSlice.reducer;
