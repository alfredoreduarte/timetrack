import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store";
import {
  fetchDashboardEarnings,
  updateCurrentTimerEarnings,
} from "../store/slices/dashboardSlice";
import Timer from "../components/Timer";
import { CurrencyDollarIcon, ClockIcon } from "@heroicons/react/24/outline";

const Dashboard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { earnings, loading } = useSelector(
    (state: RootState) => state.dashboard
  );
  const { isRunning, elapsedTime, currentEntry } = useSelector(
    (state: RootState) => state.timer
  );

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format time display
  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0h 0m";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Fetch earnings data on component mount
  useEffect(() => {
    dispatch(fetchDashboardEarnings());
  }, [dispatch]);

  // Update current timer earnings in real-time
  useEffect(() => {
    if (
      isRunning &&
      currentEntry &&
      earnings?.currentTimer?.isRunning &&
      earnings?.currentTimer?.hourlyRate
    ) {
      dispatch(
        updateCurrentTimerEarnings({
          duration: elapsedTime,
          hourlyRate: earnings.currentTimer.hourlyRate,
        })
      );
    }
  }, [
    dispatch,
    isRunning,
    elapsedTime,
    currentEntry,
    earnings?.currentTimer?.isRunning,
    earnings?.currentTimer?.hourlyRate,
  ]);

  // Calculate current timer earnings in real-time
  const getCurrentTimerEarnings = (): number => {
    if (!isRunning || !earnings?.currentTimer?.hourlyRate) return 0;
    return (earnings.currentTimer.hourlyRate * elapsedTime) / 3600;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome to your time tracking dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Current Timer
          </h3>
          <Timer />

          {/* Current Timer Earnings */}
          {isRunning &&
            earnings?.currentTimer?.hourlyRate &&
            earnings.currentTimer.hourlyRate > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-800">
                    Earning Now
                  </span>
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {formatCurrency(getCurrentTimerEarnings())}
                </div>
                <p className="text-sm text-green-700 mt-1">
                  at {formatCurrency(earnings.currentTimer.hourlyRate)}/hour
                </p>
              </div>
            )}
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-2">
            <CurrencyDollarIcon className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-medium text-gray-900">
              Today's Earnings
            </h3>
          </div>
          <div className="text-3xl font-bold text-blue-900 mb-1">
            {loading ? "..." : formatCurrency(earnings?.today.earnings || 0)}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <ClockIcon className="h-4 w-4" />
            <span>{formatTime(earnings?.today.duration || 0)} tracked</span>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-2">
            <CurrencyDollarIcon className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-medium text-gray-900">
              This Week's Earnings
            </h3>
          </div>
          <div className="text-3xl font-bold text-purple-900 mb-1">
            {loading ? "..." : formatCurrency(earnings?.thisWeek.earnings || 0)}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <ClockIcon className="h-4 w-4" />
            <span>{formatTime(earnings?.thisWeek.duration || 0)} tracked</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Recent Projects
          </h3>
          <div className="text-gray-500 text-center py-8">
            No projects yet. Create your first project to get started.
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Recent Time Entries
          </h3>
          <div className="text-gray-500 text-center py-8">
            No time entries yet. Start tracking time to see your entries here.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
