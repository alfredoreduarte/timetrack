import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { reportsAPI } from "../../services/api";
import { getUserTimezone } from "../../../../shared/src/utils/timezone";

export interface DailyData {
  date: string;
  totalDuration: number; // in seconds
  totalEarnings: number;
  entryCount: number;
}

export interface WeeklyChartData {
  dailyBreakdown: DailyData[];
  weekStartDate: string;
  weekEndDate: string;
}

export interface DetailedTimeEntry {
  id: string;
  description: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  hourlyRateSnapshot: number | null;
  earnings: number;
  createdVia?: string;
  isAiGenerated?: boolean;
  project: {
    id: string;
    name: string;
    color: string;
  } | null;
  task: {
    id: string;
    name: string;
  } | null;
}

interface ReportsState {
  weeklyData: WeeklyChartData | null;
  detailedEntries: DetailedTimeEntry[];
  loading: boolean;
  detailedLoading: boolean;
  error: string | null;
  currentWeekOffset: number; // 0 = current week, -1 = previous week, etc.
  /**
   * The week detailedEntries are from (they load separately from the chart),
   * as the bounds that were requested: they name it even after the clock
   * passes Monday.
   */
  detailedWeekStart: string | null;
  detailedWeekEnd: string | null;
  /** The latest request of each kind; a slower, older response is ignored. */
  weeklyRequestId: string | null;
  detailedRequestId: string | null;
}

const initialState: ReportsState = {
  weeklyData: null,
  detailedEntries: [],
  loading: false,
  detailedLoading: false,
  error: null,
  currentWeekOffset: 0,
  detailedWeekStart: null,
  detailedWeekEnd: null,
  weeklyRequestId: null,
  detailedRequestId: null,
};

/** YYYY-MM-DD of a date in the browser's timezone (the API keys days the same way). */
const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Helper function to get start and end of week (Monday to Sunday)
export const getWeekDates = (weekOffset: number = 0) => {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days to Monday (handle Sunday as day 7)
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;

  // Calculate start of week (Monday)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysToMonday + weekOffset * 7);
  startOfWeek.setHours(0, 0, 0, 0);

  // Calculate end of week (Sunday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return {
    startDate: startOfWeek.toISOString(),
    endDate: endOfWeek.toISOString(),
  };
};

// Async thunk to fetch weekly data
export const fetchWeeklyData = createAsyncThunk(
  "reports/fetchWeeklyData",
  async (weekOffset: number = 0) => {
    const { startDate, endDate } = getWeekDates(weekOffset);

    const response = await reportsAPI.getSummaryReport({
      startDate,
      endDate,
      timezone: getUserTimezone(),
    });

    // Extract the summary data from the response
    const summaryData = response.summary;

    // Ensure we have data for all 7 days of the week
    const allDays: DailyData[] = [];
    const startOfWeek = new Date(startDate);

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startOfWeek);
      currentDate.setDate(startOfWeek.getDate() + i);
      const dateString = localDayKey(currentDate);

      // Find existing data for this date
      const existingData = summaryData.dailyBreakdown.find(
        (day) => day.date === dateString
      );

      allDays.push({
        date: dateString,
        totalDuration: existingData?.totalDuration || 0,
        totalEarnings: existingData?.totalEarnings || 0,
        entryCount: existingData?.entryCount || 0,
      });
    }

    return {
      dailyBreakdown: allDays,
      weekStartDate: startDate,
      weekEndDate: endDate,
      weekOffset,
    };
  }
);

// Async thunk to fetch detailed time entries
export const fetchDetailedTimeEntries = createAsyncThunk(
  "reports/fetchDetailedTimeEntries",
  async (weekOffset: number = 0) => {
    const { startDate, endDate } = getWeekDates(weekOffset);

    const response = await reportsAPI.getDetailedReport({
      startDate,
      endDate,
      timezone: getUserTimezone(),
    });

    return { timeEntries: response.timeEntries, startDate, endDate };
  }
);

const reportsSlice = createSlice({
  name: "reports",
  initialState,
  reducers: {
    setWeekOffset: (state, action: PayloadAction<number>) => {
      state.currentWeekOffset = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWeeklyData.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        state.weeklyRequestId = action.meta.requestId;
      })
      .addCase(fetchWeeklyData.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.weeklyRequestId) return;
        state.loading = false;
        state.weeklyData = action.payload;
        state.currentWeekOffset = action.payload.weekOffset;
      })
      .addCase(fetchWeeklyData.rejected, (state, action) => {
        if (action.meta.requestId !== state.weeklyRequestId) return;
        state.loading = false;
        state.error = action.error.message || "Failed to fetch weekly data";
      })
      .addCase(fetchDetailedTimeEntries.pending, (state, action) => {
        state.detailedLoading = true;
        state.error = null;
        state.detailedRequestId = action.meta.requestId;
      })
      .addCase(fetchDetailedTimeEntries.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.detailedRequestId) return;
        state.detailedLoading = false;
        state.detailedEntries = action.payload.timeEntries;
        state.detailedWeekStart = action.payload.startDate;
        state.detailedWeekEnd = action.payload.endDate;
      })
      .addCase(fetchDetailedTimeEntries.rejected, (state, action) => {
        if (action.meta.requestId !== state.detailedRequestId) return;
        state.detailedLoading = false;
        state.error =
          action.error.message || "Failed to fetch detailed entries";
      });
  },
});

export const { setWeekOffset, clearError } = reportsSlice.actions;
export default reportsSlice.reducer;
