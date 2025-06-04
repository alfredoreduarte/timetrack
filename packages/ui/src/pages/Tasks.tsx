import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import { RootState } from "../store";
import {
  fetchProjects,
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  Task,
} from "../store/slices/projectsSlice";
import toast from "react-hot-toast";

interface TaskFormData {
  name: string;
  description: string;
  projectId: string;
  hourlyRate: string;
}

const Tasks: React.FC = () => {
  const dispatch = useDispatch();
  const { projects, tasks, loading, error } = useSelector(
    (state: RootState) => state.projects
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<TaskFormData>({
    name: "",
    description: "",
    projectId: "",
    hourlyRate: "",
  });

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    searchParams.get("projectId") || ""
  );
  const [completionFilter, setCompletionFilter] = useState<string>(
    searchParams.get("completed") || "all"
  );
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    dispatch(fetchProjects() as any);
  }, [dispatch]);

  useEffect(() => {
    const projectId = selectedProjectId || undefined;
    const isCompleted =
      completionFilter === "completed"
        ? true
        : completionFilter === "incomplete"
        ? false
        : undefined;

    dispatch(fetchTasks({ projectId, isCompleted }) as any);

    // Update URL params
    const params = new URLSearchParams();
    if (selectedProjectId) params.set("projectId", selectedProjectId);
    if (completionFilter !== "all") params.set("completed", completionFilter);
    setSearchParams(params);
  }, [dispatch, selectedProjectId, completionFilter, setSearchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Task name is required");
      return;
    }

    if (!formData.projectId) {
      toast.error("Project is required");
      return;
    }

    try {
      const taskData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        projectId: formData.projectId,
        hourlyRate: formData.hourlyRate
          ? parseFloat(formData.hourlyRate)
          : undefined,
      };

      if (editingTask) {
        await dispatch(
          updateTask({ id: editingTask.id, data: taskData }) as any
        );
        toast.success("Task updated successfully");
      } else {
        await dispatch(createTask(taskData) as any);
        toast.success("Task created successfully");
      }

      handleCloseModal();
    } catch (error: any) {
      console.error("Error saving task:", error);
      toast.error(error.message || "Failed to save task");
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      description: task.description || "",
      projectId: task.projectId,
      hourlyRate: task.hourlyRate ? task.hourlyRate.toString() : "",
    });
    setShowModal(true);
  };

  const handleToggleComplete = async (task: Task) => {
    try {
      await dispatch(
        updateTask({
          id: task.id,
          data: { isCompleted: !task.isCompleted },
        }) as any
      );
      toast.success(
        task.isCompleted ? "Task marked as incomplete" : "Task completed!"
      );
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast.error(error.message || "Failed to update task");
    }
  };

  const handleDelete = async (task: Task) => {
    if (window.confirm(`Are you sure you want to delete "${task.name}"?`)) {
      try {
        await dispatch(deleteTask(task.id) as any);
        toast.success("Task deleted successfully");
      } catch (error: any) {
        console.error("Error deleting task:", error);
        toast.error(error.message || "Failed to delete task");
      }
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTask(null);
    setFormData({
      name: "",
      description: "",
      projectId: "",
      hourlyRate: "",
    });
  };

  const handleNewTask = () => {
    // Pre-select project if filtered by one
    setFormData({
      name: "",
      description: "",
      projectId: selectedProjectId,
      hourlyRate: "",
    });
    setShowModal(true);
  };

  const filteredTasks = tasks;
  const activeProjects = projects.filter((p) => p.isActive);

  if (loading && tasks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
            <p className="text-gray-600">Manage your project tasks</p>
          </div>
        </div>
        <div className="card p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-600">
            Manage your project tasks and track progress
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <FunnelIcon className="h-4 w-4" />
            Filters
          </button>
          <button
            onClick={handleNewTask}
            className="btn-primary flex items-center gap-2"
            disabled={activeProjects.length === 0}
          >
            <PlusIcon className="h-5 w-5" />
            New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Projects</option>
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={completionFilter}
                onChange={(e) => setCompletionFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Tasks</option>
                <option value="incomplete">Incomplete</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {activeProjects.length === 0 ? (
        <div className="card p-6">
          <div className="text-gray-500 text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No active projects
            </h3>
            <p className="text-gray-600 mb-4">
              You need to create a project before you can add tasks.
            </p>
            <a
              href="/projects"
              className="btn-primary inline-flex items-center gap-2"
            >
              <PlusIcon className="h-5 w-5" />
              Create Project
            </a>
          </div>
        </div>
      ) : filteredTasks.length === 0 && !loading ? (
        <div className="card p-6">
          <div className="text-gray-500 text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No tasks found
            </h3>
            <p className="text-gray-600 mb-4">
              {selectedProjectId || completionFilter !== "all"
                ? "No tasks match your current filters."
                : "Create your first task to start organizing your work."}
            </p>
            <button
              onClick={handleNewTask}
              className="btn-primary flex items-center gap-2 mx-auto"
            >
              <PlusIcon className="h-5 w-5" />
              Create Task
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            const taskProject = projects.find((p) => p.id === task.projectId);
            return (
              <div
                key={task.id}
                className={`card p-6 hover:shadow-lg transition-shadow ${
                  task.isCompleted ? "bg-gray-50" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <button
                      onClick={() => handleToggleComplete(task)}
                      className={`mt-1 p-1 rounded-full transition-colors ${
                        task.isCompleted
                          ? "text-green-600 bg-green-100"
                          : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                      }`}
                    >
                      <CheckIcon className="h-5 w-5" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {taskProject && (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{
                                backgroundColor: taskProject.color || "#3B82F6",
                              }}
                            ></div>
                            <span className="text-sm font-medium text-gray-700">
                              {taskProject.name}
                            </span>
                          </div>
                        )}
                        {task.hourlyRate && (
                          <span className="text-sm text-gray-500">
                            ${task.hourlyRate}/hr
                          </span>
                        )}
                      </div>

                      <h3
                        className={`text-lg font-semibold mb-2 ${
                          task.isCompleted
                            ? "text-gray-500 line-through"
                            : "text-gray-900"
                        }`}
                      >
                        {task.name}
                      </h3>

                      {task.description && (
                        <p className="text-gray-600 text-sm mb-3">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>
                          Created{" "}
                          {new Date(task.createdAt).toLocaleDateString()}
                        </span>
                        {task._count && task._count.timeEntries > 0 && (
                          <div className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4" />
                            <span>
                              {task._count.timeEntries} time{" "}
                              {task._count.timeEntries === 1
                                ? "entry"
                                : "entries"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleEdit(task)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Edit task"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete task"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingTask ? "Edit Task" : "Create New Task"}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project *
                  </label>
                  <select
                    value={formData.projectId}
                    onChange={(e) =>
                      setFormData({ ...formData, projectId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select a project</option>
                    {activeProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Task Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter task name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter task description"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hourly Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.hourlyRate}
                    onChange={(e) =>
                      setFormData({ ...formData, hourlyRate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to use project or default rate
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 btn-primary disabled:opacity-50"
                  >
                    {loading
                      ? "Saving..."
                      : editingTask
                      ? "Update Task"
                      : "Create Task"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
