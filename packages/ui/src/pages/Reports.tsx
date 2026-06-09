import React, { useEffect, useMemo, useState } from "react";
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
  const user = useSelector((state: RootState) => state.auth.user);

  const aiMultiplier = user?.aiMultiplier ?? 3;
  const [applyMultiplier, setApplyMultiplier] = useState(false);

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

  const totals = useMemo(() => {
    let duration = 0;
    let earnings = 0;
    let aiDuration = 0;
    let aiEarnings = 0;
    for (const entry of detailedEntries) {
      duration += entry.duration || 0;
      earnings += entry.earnings || 0;
      if (entry.isAiGenerated) {
        aiDuration += entry.duration || 0;
        aiEarnings += entry.earnings || 0;
      }
    }
    const extraMultiplier = aiMultiplier - 1;
    return {
      duration,
      earnings,
      aiDuration,
      aiEarnings,
      adjustedDuration: duration + aiDuration * extraMultiplier,
      adjustedEarnings: earnings + aiEarnings * extraMultiplier,
    };
  }, [detailedEntries, aiMultiplier]);

  const hasAi = totals.aiDuration > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600">Analyze your time tracking data</p>
        </div>
        {hasAi && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-md bg-violet-50 border border-violet-200">
            <SparklesIcon className="h-4 w-4 text-violet-600" aria-hidden="true" />
            <span className="text-sm font-medium text-violet-900">
              Bill AI work at {aiMultiplier.toFixed(1)}×
            </span>
            <input
              type="checkbox"
              className="rounded ml-1"
              checked={applyMultiplier}
              onChange={(e) => setApplyMultiplier(e.target.checked)}
              aria-label="Apply AI billing multiplier to totals"
            />
          </label>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {hasAi && (
        <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Billable hours</p>
            <p className="text-2xl font-semibold text-gray-900 tabular-nums">
              {formatHours(applyMultiplier ? totals.adjustedDuration : totals.duration)}
            </p>
            {applyMultiplier && (
              <p className="text-xs text-violet-700 mt-1">
                +{formatHours(totals.adjustedDuration - totals.duration)} from {aiMultiplier.toFixed(1)}× multiplier on{" "}
                {formatHours(totals.aiDuration)} AI work
              </p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Billable earnings</p>
            <p className="text-2xl font-semibold text-gray-900 tabular-nums">
              ${(applyMultiplier ? totals.adjustedEarnings : totals.earnings).toFixed(2)}
            </p>
            {applyMultiplier && (
              <p className="text-xs text-violet-700 mt-1">
                +${(totals.adjustedEarnings - totals.earnings).toFixed(2)} from multiplier
              </p>
            )}
          </div>
        </div>
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
