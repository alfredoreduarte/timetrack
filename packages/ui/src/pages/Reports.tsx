import React, { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { RootState, AppDispatch } from "../store";
import {
  fetchWeeklyData,
  fetchDetailedTimeEntries,
} from "../store/slices/reportsSlice";
import WeeklyChart from "../components/WeeklyChart";
import DetailedTimeEntriesTable from "../components/DetailedTimeEntriesTable";

const formatHours = (seconds: number) =>
  `${(seconds / 3600).toFixed(2)} h`;

const Reports: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const {
    weeklyData,
    detailedEntries,
    loading,
    detailedLoading,
    error,
    currentWeekOffset,
  } = useSelector((state: RootState) => state.reports);

  useEffect(() => {
    dispatch(fetchWeeklyData(0));
    dispatch(fetchDetailedTimeEntries(0));
  }, [dispatch]);

  const handlePreviousWeek = () => {
    const newOffset = currentWeekOffset - 1;
    dispatch(fetchWeeklyData(newOffset));
    dispatch(fetchDetailedTimeEntries(newOffset));
  };

  const handleNextWeek = () => {
    if (currentWeekOffset < 0) {
      const newOffset = currentWeekOffset + 1;
      dispatch(fetchWeeklyData(newOffset));
      dispatch(fetchDetailedTimeEntries(newOffset));
    }
  };

  // The week's totals are in the chart below; this adds how much was AI work.
  const ai = useMemo(() => {
    let duration = 0;
    let earnings = 0;
    for (const entry of detailedEntries) {
      if (!entry.isAiGenerated) continue;
      duration += entry.duration || 0;
      earnings += entry.earnings || 0;
    }
    return { duration, earnings };
  }, [detailedEntries]);

  const hasAi = ai.duration > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600">Analyze your time tracking data</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {hasAi && (
        <p className="card px-4 py-3 text-sm text-violet-800 inline-flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-violet-600" aria-hidden="true" />
          AI work this week: {formatHours(ai.duration)} · ${ai.earnings.toFixed(2)}
        </p>
      )}

      {weeklyData && (
        <WeeklyChart
          data={weeklyData.dailyBreakdown}
          weekStartDate={weeklyData.weekStartDate}
          weekEndDate={weeklyData.weekEndDate}
          loading={loading}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
        />
      )}

      <DetailedTimeEntriesTable
        entries={detailedEntries}
        loading={detailedLoading}
      />

      {!weeklyData && loading && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-center h-80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading weekly data...</p>
            </div>
          </div>
        </div>
      )}

      {!weeklyData && !loading && !error && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No data available
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Start tracking time to see your weekly reports.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
