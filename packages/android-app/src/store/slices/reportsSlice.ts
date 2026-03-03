import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { reportsAPI } from "../../services/api";

export interface DailyData {
  date: string;
  totalDuration: number;
  totalEarnings: number;
  entryCount: number;
}

export interface WeeklyChartData {
  dailyBreakdown: DailyData[];
  weekStartDate: string;
  weekEndDate: string;
}

interface ReportsState {
  weeklyData: WeeklyChartData | null;
  loading: boolean;
  error: string | null;
  currentWeekOffset: number;
}

const initialState: ReportsState = {
  weeklyData: null,
  loading: false,
  error: null,
  currentWeekOffset: 0,
};

const getWeekDates = (weekOffset: number = 0) => {
  const now = new Date();
  const currentDay = now.getDay();
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysToMonday + weekOffset * 7);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return {
    startDate: startOfWeek.toISOString(),
    endDate: endOfWeek.toISOString(),
  };
};

const getUserTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export const fetchWeeklyData = createAsyncThunk(
  "reports/fetchWeeklyData",
  async (weekOffset: number = 0) => {
    const { startDate, endDate } = getWeekDates(weekOffset);

    const response = await reportsAPI.getSummaryReport({
      startDate,
      endDate,
      timezone: getUserTimezone(),
    });

    const summaryData = response.summary;
    const allDays: DailyData[] = [];
    const startOfWeek = new Date(startDate);

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startOfWeek);
      currentDate.setDate(startOfWeek.getDate() + i);
      const dateString = currentDate.toISOString().split("T")[0];

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
      .addCase(fetchWeeklyData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWeeklyData.fulfilled, (state, action) => {
        state.loading = false;
        state.weeklyData = action.payload;
        state.currentWeekOffset = action.payload.weekOffset;
      })
      .addCase(fetchWeeklyData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch weekly data";
      });
  },
});

export const { setWeekOffset, clearError } = reportsSlice.actions;
export default reportsSlice.reducer;
