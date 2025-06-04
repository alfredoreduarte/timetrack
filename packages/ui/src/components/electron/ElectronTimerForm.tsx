import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store";
import { useTimer } from "../../hooks/useTimer";
import { fetchProjects } from "../../store/slices/projectsSlice";
import { fetchTasks } from "../../store/slices/projectsSlice";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/24/solid";

const ElectronTimerForm: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { projects = [], tasks = [] } = useSelector(
    (state: RootState) => state.projects
  );

  const { startTimer, loading } = useTimer();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Load initial data
  useEffect(() => {
    dispatch(fetchProjects());
  }, [dispatch]);

  // Load tasks when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      dispatch(fetchTasks({ projectId: selectedProjectId }));
    }
  }, [selectedProjectId, dispatch]);

  const handleStartTimer = async () => {
    if (!selectedProjectId) return;

    try {
      await startTimer({
        projectId: selectedProjectId,
        taskId: selectedTaskId || undefined,
        description: description || undefined,
      });
      // Clear form after starting
      setDescription("");
    } catch (error) {
      // Error is already logged in the hook
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loading && selectedProjectId) {
      handleStartTimer();
    }
  };

  const availableTasks = Array.isArray(tasks) ? tasks : [];
  const activeProjects = projects.filter((p) => p.isActive);

  return (
    <div className="p-4 border-b border-gray-200 bg-white">
      <form onSubmit={handleFormSubmit} className="space-y-3">
        {/* Project Selector */}
        <div>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="no-drag w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              required
            >
              <option value="">Select project...</option>
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Task Selector */}
        {selectedProjectId && (
          <div>
            <div className="relative">
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="no-drag w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="">No task</option>
                {availableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Description Input */}
        <div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="no-drag w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Start Button */}
        <button
          type="submit"
          disabled={!selectedProjectId || loading}
          className="no-drag w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <PlayIcon className="h-4 w-4" />
          {loading ? "Starting..." : "Start Timer"}
        </button>
      </form>
    </div>
  );
};

export default ElectronTimerForm;
