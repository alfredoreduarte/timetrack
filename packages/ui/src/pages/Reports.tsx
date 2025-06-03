import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "../store";
import { fetchWeeklyData } from "../store/slices/reportsSlice";
import WeeklyChart from "../components/WeeklyChart";

const Reports: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { weeklyData, loading, error, currentWeekOffset } = useSelector(
    (state: RootState) => state.reports
  );

  // Load current week data on component mount
  useEffect(() => {
    dispatch(fetchWeeklyData(0));
  }, [dispatch]);

  // Navigation handlers
  const handlePreviousWeek = () => {
    const newOffset = currentWeekOffset - 1;
    dispatch(fetchWeeklyData(newOffset));
  };

  const handleNextWeek = () => {
    // Don't allow navigating to future weeks beyond current week
    if (currentWeekOffset < 0) {
      const newOffset = currentWeekOffset + 1;
      dispatch(fetchWeeklyData(newOffset));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600">Analyze your time tracking data</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error loading reports data
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Chart */}
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

      {/* Show loading state when no data yet */}
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

      {/* Empty state when no data and not loading */}
      {!weeklyData && !loading && !error && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M9 17a2 2 0 012-2h20a2 2 0 012 2v6a2 2 0 01-2 2H11a2 2 0 01-2-2v-6zM21 12h6a2 2 0 012 2v6a2 2 0 01-2 2H21a2 2 0 01-2-2v-6a2 2 0 012-2z"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
