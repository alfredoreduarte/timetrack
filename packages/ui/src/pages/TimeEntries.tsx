import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "../store";
import {
  fetchTimeEntries,
  deleteTimeEntry,
  TimeEntry,
} from "../store/slices/timeEntriesSlice";
import { useTimer } from "../hooks/useTimer";
import { fetchProjects } from "../store/slices/projectsSlice";
import Timer from "../components/Timer";
import LoadingSpinner from "../components/LoadingSpinner";
import { formatReportsDuration, formatDateTime } from "../utils/dateTime";
import { ClockIcon } from "@heroicons/react/24/outline";
import { StopIcon } from "@heroicons/react/24/solid";

const TimeEntries: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { entries, loading, error, pagination } = useSelector(
    (state: RootState) => state.timeEntries
  );
  const { projects } = useSelector((state: RootState) => state.projects);

  // Use centralized timer hook
  const { stopTimer } = useTimer();

  // Local state for filters
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Safe defaults to prevent undefined errors
  const safeEntries = entries || [];
  const safeProjects = projects || [];

  // Load initial data
  useEffect(() => {
    dispatch(fetchTimeEntries({}));
    dispatch(fetchProjects());
  }, [dispatch]);

  // Apply filters
  const applyFilters = () => {
    const params: any = {};
    if (selectedProject) params.projectId = selectedProject;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    dispatch(fetchTimeEntries(params));
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedProject("");
    setStartDate("");
    setEndDate("");
    dispatch(fetchTimeEntries({}));
  };

  // Calculate earnings for an entry
  const calculateEarnings = (entry: TimeEntry): number => {
    // Try to get hourly rate from the full project object in the store first
    const fullProject = safeProjects.find((p) => p.id === entry.projectId);
    const hourlyRate = fullProject?.hourlyRate || 0;
    const hours = entry.duration / 3600;
    return hours * hourlyRate;
  };

  // Handle delete entry
  const handleDeleteEntry = async (entryId: string) => {
    if (window.confirm("Are you sure you want to delete this time entry?")) {
      try {
        await dispatch(deleteTimeEntry(entryId)).unwrap();
      } catch (error) {
        console.error("Failed to delete time entry:", error);
      }
    }
  };

  // Handle stop timer for running entries
  const handleStopTimer = async () => {
    try {
      await stopTimer();
      // Refresh entries after stopping timer
      dispatch(fetchTimeEntries({}));
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  // Load more entries (pagination)
  const loadMore = () => {
    if (!pagination) return;

    const params: any = { page: pagination.page + 1 };
    if (selectedProject) params.projectId = selectedProject;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    dispatch(fetchTimeEntries(params));
  };

  // Check if entry is currently running (no endTime)
  const isRunningEntry = (entry: TimeEntry): boolean => {
    return !entry.endTime;
  };

  if (loading && safeEntries.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Entries</h1>
          <p className="text-gray-600">
            View and manage your time tracking records
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary"
          >
            {showFilters ? "Hide Filters" : "Show Filters"}
          </button>
        </div>
      </div>

      {/* Quick Timer Section */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Timer</h3>
        <Timer />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Projects</option>
                {safeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex space-x-3 mt-4">
            <button onClick={applyFilters} className="btn-primary">
              Apply Filters
            </button>
            <button onClick={clearFilters} className="btn-secondary">
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Time Entries List */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Time Entries ({pagination?.total ?? 0})
          </h3>
        </div>

        {safeEntries.length === 0 ? (
          <div className="text-gray-500 text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No time entries found
            </h3>
            <p className="text-gray-600 mb-4">
              {showFilters && (selectedProject || startDate || endDate)
                ? "No entries match your current filters. Try adjusting your search criteria."
                : "Start tracking time to see your entries here."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {safeEntries.map((entry) => {
              const isRunning = isRunningEntry(entry);
              return (
                <div
                  key={entry.id}
                  className={`p-6 transition-colors ${
                    isRunning
                      ? "bg-green-50 hover:bg-green-100 border-l-4 border-green-500"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        {entry.project && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: entry.project.color || "#6B7280",
                            }}
                          />
                        )}
                        <h4 className="text-lg font-medium text-gray-900">
                          {entry.project?.name || "No Project"}
                        </h4>
                        {entry.task && (
                          <span className="text-sm text-gray-500">
                            • {entry.task.name}
                          </span>
                        )}
                        {isRunning && (
                          <div className="flex items-center space-x-2">
                            <ClockIcon className="h-4 w-4 text-green-600 animate-pulse" />
                            <span className="text-sm font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                              Running
                            </span>
                          </div>
                        )}
                      </div>
                      {entry.description && (
                        <p className="text-gray-600 mt-1">
                          {entry.description}
                        </p>
                      )}
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        <span>{formatDateTime(entry.startTime)}</span>
                        {entry.endTime && (
                          <>
                            <span>→</span>
                            <span>{formatDateTime(entry.endTime)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-medium text-gray-900">
                        {formatReportsDuration(entry.duration)}
                      </div>
                      <div className="text-sm text-green-600 font-medium">
                        ${calculateEarnings(entry).toFixed(2)}
                      </div>
                      {isRunning ? (
                        <button
                          onClick={handleStopTimer}
                          className="flex items-center gap-1 text-red-600 hover:text-red-700 text-sm mt-1 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                        >
                          <StopIcon className="h-4 w-4" />
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="text-red-600 hover:text-red-700 text-sm mt-1 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                of {pagination.total} entries
              </p>
              {pagination.page < pagination.pages && (
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="btn-secondary disabled:opacity-50"
                >
                  {loading ? "Loading..." : "Load More"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeEntries;
