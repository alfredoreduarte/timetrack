import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store";
import { useTimer } from "../hooks/useTimer";
import {
  fetchDashboardEarnings,
  updateCurrentTimerEarnings,
} from "../store/slices/dashboardSlice";
import { fetchTimeEntries, TimeEntry } from "../store/slices/timeEntriesSlice";
import { fetchProjects } from "../store/slices/projectsSlice";
import Timer from "../components/Timer";
import { formatReportsDuration, formatDateTime } from "../utils/dateTime";
import { ClockIcon } from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/24/solid";

const Dashboard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  // Use centralized timer hook
  const { isRunning, currentEntry, elapsedTime, startTimer } = useTimer();

  const { earnings, loading: earningsLoading } = useSelector(
    (state: RootState) => state.dashboard
  );
  const { entries: timeEntries } = useSelector(
    (state: RootState) => state.timeEntries
  );
  const { projects } = useSelector((state: RootState) => state.projects);

  // Safe defaults to prevent undefined errors
  const safeTimeEntries = Array.isArray(timeEntries) ? timeEntries : [];

  // Fetch earnings data on component mount
  useEffect(() => {
    dispatch(fetchDashboardEarnings());
    dispatch(fetchTimeEntries({ limit: 5 })); // Fetch recent entries for the section
    dispatch(fetchProjects()); // Fetch projects for the recent entries
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

  // Handle resume timer from entry
  const handleResumeTimer = async (entry: TimeEntry) => {
    if (isRunning) return; // Prevent starting if already running

    try {
      await startTimer({
        projectId: entry.projectId,
        taskId: entry.taskId || undefined,
        description: entry.description || undefined,
      });
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  // Calculate earnings for an entry
  const calculateEarnings = (entry: TimeEntry): number => {
    const project = projects.find((p: any) => p.id === entry.projectId);
    const hourlyRate = project?.hourlyRate || 0;
    const hours = (entry.duration || 0) / 3600;
    return hours * hourlyRate;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Track your time and monitor earnings</p>
      </div>

      {/* Timer and Earnings Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Timer Section */}
        <div className="card p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Time Tracker
          </h2>
          <Timer />
        </div>

        {/* Earnings Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Today's Earnings */}
          <div className="card p-4">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Today</p>
                <p className="text-xl font-bold text-gray-900">
                  {earningsLoading
                    ? "..."
                    : `$${(typeof earnings?.today === "object"
                        ? earnings.today.earnings
                        : 0
                      ).toFixed(2)}`}
                </p>
              </div>
              <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
                💰
              </div>
            </div>
          </div>

          {/* This Week's Earnings */}
          <div className="card p-4">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">This Week</p>
                <p className="text-xl font-bold text-gray-900">
                  {earningsLoading
                    ? "..."
                    : `$${(typeof earnings?.thisWeek === "object"
                        ? earnings.thisWeek.earnings
                        : 0
                      ).toFixed(2)}`}
                </p>
              </div>
              <div className="h-10 w-10 bg-green-50 rounded-lg flex items-center justify-center">
                📊
              </div>
            </div>
          </div>

          {/* Currently Earning */}
          {earnings?.currentTimer?.hourlyRate !== undefined &&
            earnings.currentTimer.hourlyRate > 0 && (
              <div className="card p-4 bg-green-50 border-green-200">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-600">
                      Earning Now
                    </p>
                    <p className="text-xl font-bold text-green-700">
                      ${getCurrentTimerEarnings().toFixed(2)}
                    </p>
                  </div>
                  <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <ClockIcon className="h-5 w-5 text-green-600 animate-pulse" />
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Recent Time Entries */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Recent Time Entries
          </h3>
        </div>
        <div className="p-6">
          {safeTimeEntries.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              <p>
                No time entries yet. Start tracking to see your entries here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {safeTimeEntries.slice(0, 5).map((entry: TimeEntry) => {
                const project = projects.find(
                  (p: any) => p.id === entry.projectId
                );
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {project && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: project.color || "#6B7280",
                          }}
                        />
                      )}
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {project?.name || "No Project"}
                        </h4>
                        {entry.task && (
                          <p className="text-sm text-gray-500">
                            {entry.task.name}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-sm text-gray-600">
                            {entry.description}
                          </p>
                        )}
                        {entry.task == undefined &&
                          entry.description == undefined && (
                            <p className="text-sm text-gray-500">
                              <i>No associated task or description</i>
                            </p>
                          )}
                        <p className="text-xs text-gray-500">
                          {formatDateTime(entry.startTime)}
                          {entry.endTime &&
                            ` - ${formatDateTime(entry.endTime)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          {formatReportsDuration(entry.duration || 0)}
                        </p>
                        <p className="text-sm text-green-600">
                          ${calculateEarnings(entry).toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleResumeTimer(entry)}
                        disabled={isRunning}
                        className="ml-3 p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Resume this timer"
                      >
                        <PlayIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
