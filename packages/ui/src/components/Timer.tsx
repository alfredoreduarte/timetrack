import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store";
import { useTimer } from "../hooks/useTimer";
import { fetchProjects } from "../store/slices/projectsSlice";
import { fetchTasks } from "../store/slices/projectsSlice";
import { fetchTimeEntries } from "../store/slices/timeEntriesSlice";
import { ClockIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { StopIcon, PlayIcon } from "@heroicons/react/24/solid";
import ResumeLastTimer from "./ResumeLastTimer";

interface TimerProps {
  className?: string;
}

const Timer: React.FC<TimerProps> = ({ className = "" }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { projects = [], tasks = [] } = useSelector(
    (state: RootState) => state.projects
  );

  // Use centralized timer hook
  const {
    isRunning,
    currentEntry,
    elapsedTime,
    loading,
    error,
    startTimer,
    stopTimer,
    formatTime,
  } = useTimer();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [showProjectSelector, setShowProjectSelector] = useState(false);

  // Load initial data
  useEffect(() => {
    dispatch(fetchProjects());
    dispatch(fetchTimeEntries({ limit: 10 })); // Load recent entries for ResumeLastTimer
  }, [dispatch]);

  // Load tasks when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      dispatch(fetchTasks({ projectId: selectedProjectId }));
    }
  }, [selectedProjectId, dispatch]);

  // Set current project/task if timer is running
  useEffect(() => {
    if (currentEntry) {
      setSelectedProjectId(currentEntry.projectId || "");
      setSelectedTaskId(currentEntry.taskId || "");
      setDescription(currentEntry.description || "");
    } else {
      // Clear local state when timer is stopped (currentEntry becomes null)
      setSelectedProjectId("");
      setSelectedTaskId("");
      setDescription("");
    }
  }, [currentEntry]);

  const handleStartTimer = async () => {
    if (!selectedProjectId) {
      setShowProjectSelector(true);
      return;
    }

    try {
      await startTimer({
        projectId: selectedProjectId,
        taskId: selectedTaskId || undefined,
        description: description || undefined,
      });
      setShowProjectSelector(false);
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  const handleStopTimer = async () => {
    try {
      await stopTimer();
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  // Handle form submission (for Enter key support)
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRunning && !loading && selectedProjectId) {
      handleStartTimer();
    }
  };

  // Handle Enter key in form fields
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isRunning && !loading && selectedProjectId) {
      e.preventDefault();
      handleStartTimer();
    }
  };

  const selectedProject = Array.isArray(projects)
    ? projects.find((p) => p.id === selectedProjectId)
    : undefined;

  // Since we fetch tasks with a specific projectId, all tasks in the store
  // should already be for the selected project, no need to filter again
  const availableTasks = Array.isArray(tasks) ? tasks : [];

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
        <form onSubmit={handleFormSubmit} className="space-y-4 mb-6">
          <div>
            <label
              htmlFor="project"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Project *
            </label>
            <div className="relative">
              <select
                id="project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                required
              >
                <option value="">Select a project</option>
                {projects
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

          {selectedProjectId && (
            <div>
              <label
                htmlFor="task"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Task (Optional)
              </label>
              <div className="relative">
                <select
                  id="task"
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                >
                  <option value="">No task</option>
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
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Description (Optional)
            </label>
            <input
              type="text"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What are you working on?"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </form>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Timer Controls */}
      <div className="flex gap-3">
        {!isRunning ? (
          <button
            onClick={handleStartTimer}
            disabled={loading || !selectedProjectId}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            type="submit"
            form={!isRunning || showProjectSelector ? undefined : "timer-form"}
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

      {/* Resume Last Timer Component */}
      <ResumeLastTimer />
    </div>
  );
};

export default Timer;
