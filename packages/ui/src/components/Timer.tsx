import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store";
import {
  startTimer,
  stopTimer,
  tick,
  syncTimer,
} from "../store/slices/timerSlice";
import { fetchProjects } from "../store/slices/projectsSlice";
import { fetchTasks } from "../store/slices/projectsSlice";
import { fetchDashboardEarnings } from "../store/slices/dashboardSlice";
import {
  PlayIcon,
  StopIcon,
  ClockIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

interface TimerProps {
  className?: string;
}

const Timer: React.FC<TimerProps> = ({ className = "" }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { isRunning, currentEntry, elapsedTime, loading, error } = useSelector(
    (state: RootState) => state.timer
  );
  const { projects = [], tasks = [] } = useSelector(
    (state: RootState) => state.projects
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [showProjectSelector, setShowProjectSelector] = useState(false);

  // Format time display
  const formatTime = (seconds: number): string => {
    // Validate input to prevent NaN display
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "00:00:00";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Timer tick effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        dispatch(tick());
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, dispatch]);

  // Load initial data
  useEffect(() => {
    dispatch(fetchProjects());
    // fetchCurrentEntry is now handled at the app level to avoid race conditions
  }, [dispatch]);

  // Load tasks when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      dispatch(fetchTasks(selectedProjectId));
    }
  }, [selectedProjectId, dispatch]);

  // Set current project/task if timer is running
  useEffect(() => {
    if (currentEntry) {
      setSelectedProjectId(currentEntry.projectId || "");
      setSelectedTaskId(currentEntry.taskId || "");
      setDescription(currentEntry.description || "");
      // Sync timer with actual elapsed time when current entry changes
      dispatch(syncTimer());
    }
  }, [currentEntry, dispatch]);

  // Sync timer with server time periodically (every 30 seconds)
  useEffect(() => {
    let syncInterval: NodeJS.Timeout;
    if (isRunning) {
      syncInterval = setInterval(() => {
        dispatch(syncTimer());
      }, 30000); // Sync every 30 seconds
    }
    return () => {
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isRunning, dispatch]);

  const handleStartTimer = async () => {
    if (!selectedProjectId) {
      setShowProjectSelector(true);
      return;
    }

    try {
      await dispatch(
        startTimer({
          projectId: selectedProjectId,
          taskId: selectedTaskId || undefined,
          description: description || undefined,
        })
      ).unwrap();
      setShowProjectSelector(false);
      // Refresh earnings data after starting timer
      dispatch(fetchDashboardEarnings());
    } catch (error) {
      console.error("Failed to start timer:", error);
    }
  };

  const handleStopTimer = async () => {
    if (currentEntry) {
      try {
        await dispatch(stopTimer(currentEntry.id)).unwrap();
        setDescription("");
        // Refresh earnings data after stopping timer
        dispatch(fetchDashboardEarnings());
      } catch (error) {
        console.error("Failed to stop timer:", error);
      }
    }
  };

  const selectedProject = Array.isArray(projects)
    ? projects.find((p) => p.id === selectedProjectId)
    : undefined;
  const availableTasks = Array.isArray(tasks)
    ? tasks.filter((t) => t.projectId === selectedProjectId)
    : [];

  return (
    <div className={`${className}`}>
      {/* Timer Display */}
      <div className="text-center mb-6">
        <div className="timer-display mb-2">{formatTime(elapsedTime)}</div>
        {currentEntry && selectedProject && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">{selectedProject.name}</span>
            {currentEntry.taskId && (
              <>
                {" • "}
                <span>
                  {
                    availableTasks.find((t) => t.id === currentEntry.taskId)
                      ?.name
                  }
                </span>
              </>
            )}
          </div>
        )}
        {currentEntry && description && (
          <div className="text-sm text-gray-500 mt-1">{description}</div>
        )}
      </div>

      {/* Project Selector (shown when not running or when no project selected) */}
      {(!isRunning || showProjectSelector) && (
        <div className="space-y-4 mb-6">
          <div>
            <label
              htmlFor="project-select"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Project *
            </label>
            <div className="relative">
              <select
                id="project-select"
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setSelectedTaskId(""); // Reset task when project changes
                }}
                className="input-field appearance-none pr-10"
                required
              >
                <option value="">Select a project...</option>
                {Array.isArray(projects) &&
                  projects
                    .filter((p) => p.isActive)
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {selectedProjectId && availableTasks.length > 0 && (
            <div>
              <label
                htmlFor="task-select"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Task (optional)
              </label>
              <div className="relative">
                <select
                  id="task-select"
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="input-field appearance-none pr-10"
                >
                  <option value="">No specific task</option>
                  {availableTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="description-input"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Description (optional)
            </label>
            <input
              id="description-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you working on?"
              className="input-field"
              disabled={isRunning}
            />
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex gap-3">
        {!isRunning ? (
          <button
            onClick={handleStartTimer}
            disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <PlayIcon className="h-4 w-4" />
            {loading ? "Starting..." : "Start Timer"}
          </button>
        ) : (
          <>
            <button
              onClick={handleStopTimer}
              disabled={loading}
              className="btn-danger flex-1 flex items-center justify-center gap-2"
            >
              <StopIcon className="h-4 w-4" />
              {loading ? "Stopping..." : "Stop Timer"}
            </button>
            {showProjectSelector && (
              <button
                onClick={() => setShowProjectSelector(false)}
                className="btn-secondary px-4"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>

      {/* Project requirement notice */}
      {!selectedProjectId && !isRunning && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <ClockIcon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">Project Required</p>
              <p>
                All time tracking must be associated with a project. Please
                select a project to start timing.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timer;
