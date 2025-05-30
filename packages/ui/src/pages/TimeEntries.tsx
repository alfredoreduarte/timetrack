import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "../store";
import {
  fetchTimeEntries,
  deleteTimeEntry,
  TimeEntry,
} from "../store/slices/timeEntriesSlice";
import { fetchProjects } from "../store/slices/projectsSlice";
import Timer from "../components/Timer";
import LoadingSpinner from "../components/LoadingSpinner";

const TimeEntries: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { entries, loading, error, pagination } = useSelector(
    (state: RootState) => state.timeEntries
  );
  const { projects } = useSelector((state: RootState) => state.projects);

  // Safe access with defaults to handle undefined state
  const safeEntries = entries || [];
  const safeProjects = projects || [];

  // Local state for filters
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Load data on component mount
  useEffect(() => {
    console.log("TimeEntries useEffect triggered - fetching data");
    dispatch(fetchTimeEntries({}));
    if (safeProjects.length === 0) {
      console.log("Fetching projects...");
      dispatch(fetchProjects());
    }
  }, [dispatch, safeProjects.length]);

  // Apply filters
  const applyFilters = () => {
    const params: any = {};
    if (selectedProject) params.projectId = selectedProject;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    console.log("Applying filters:", params);
    dispatch(fetchTimeEntries(params));
  };

  // Clear filters
  const clearFilters = () => {
    setSelectedProject("");
    setStartDate("");
    setEndDate("");
    console.log("Clearing filters, fetching all entries");
    dispatch(fetchTimeEntries({}));
  };

  // Format duration from seconds to readable string
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Format date and time
  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString("en-US") +
      " " +
      date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    );
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

  // Load more entries (pagination)
  const loadMore = () => {
    if (!pagination) return;

    const params: any = { page: pagination.page + 1 };
    if (selectedProject) params.projectId = selectedProject;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    dispatch(fetchTimeEntries(params));
  };

  if (loading && safeEntries.length === 0) {
    return <LoadingSpinner />;
  }

  // Add console log to debug state
  console.log("TimeEntries state:", {
    entries: safeEntries,
    projects: safeProjects,
    pagination,
    entriesLength: safeEntries.length,
    projectsLength: safeProjects.length,
  });

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
            {safeEntries.map((entry) => (
              <div
                key={entry.id}
                className="p-6 hover:bg-gray-50 transition-colors"
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
                    </div>
                    {entry.description && (
                      <p className="text-gray-600 mt-1">{entry.description}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                      <span>Started: {formatDateTime(entry.startTime)}</span>
                      {entry.endTime && (
                        <span>Ended: {formatDateTime(entry.endTime)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {formatDuration(entry.duration)}
                      </div>
                      {(() => {
                        const fullProject = safeProjects.find(
                          (p) => p.id === entry.projectId
                        );
                        return (
                          fullProject?.hourlyRate && (
                            <div className="text-sm text-green-600">
                              ${calculateEarnings(entry).toFixed(2)}
                            </div>
                          )
                        );
                      })()}
                    </div>
                    {entry.endTime && (
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                        title="Delete entry"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > pagination.page && (
          <div className="px-6 py-4 border-t border-gray-200">
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full btn-secondary"
            >
              {loading ? "Loading..." : "Load More"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeEntries;
