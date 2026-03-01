import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, useNavigate } from "react-router-dom";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  ArrowPathIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { RootState, AppDispatch } from "../store";
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  Project,
  Task,
} from "../store/slices/projectsSlice";
import { syncGitHubIssues } from "../store/slices/githubSlice";
import { githubAPI } from "../services/api";
import GitHubRepoModal from "../components/GitHubRepoModal";
import toast from "react-hot-toast";

interface ProjectFormData {
  name: string;
  description: string;
  color: string;
  hourlyRate: string;
}

interface TaskFormData {
  name: string;
  description: string;
  hourlyRate: string;
}

const Projects: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId?: string }>();
  const { projects, tasks, loading, error } = useSelector(
    (state: RootState) => state.projects
  );
  const { connected: githubConnected, syncing } = useSelector(
    (state: RootState) => state.github
  );
  const [showRepoModal, setShowRepoModal] = useState(false);

  // Project state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectFormData, setProjectFormData] = useState<ProjectFormData>({
    name: "",
    description: "",
    color: "#3B82F6",
    hourlyRate: "",
  });

  // Task state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskFormData, setTaskFormData] = useState<TaskFormData>({
    name: "",
    description: "",
    hourlyRate: "",
  });

  useEffect(() => {
    dispatch(fetchProjects() as any);
  }, [dispatch]);

  // Handle URL parameter changes and set selected project
  useEffect(() => {
    if (projectId && projects.length > 0) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        setSelectedProject(project);
      } else {
        // Project not found, redirect to projects list
        navigate("/projects", { replace: true });
      }
    } else if (!projectId) {
      setSelectedProject(null);
    }
  }, [projectId, projects, navigate]);

  // Fetch tasks when a project is selected
  useEffect(() => {
    if (selectedProject) {
      dispatch(fetchTasks({ projectId: selectedProject.id }) as any);
    }
  }, [dispatch, selectedProject]);

  // Project handlers
  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectFormData.name.trim()) {
      toast.error("Project name is required");
      return;
    }

    try {
      const projectData = {
        name: projectFormData.name.trim(),
        description: projectFormData.description.trim() || undefined,
        color: projectFormData.color,
        hourlyRate: projectFormData.hourlyRate
          ? parseFloat(projectFormData.hourlyRate)
          : undefined,
      };

      if (editingProject) {
        await dispatch(
          updateProject({ id: editingProject.id, data: projectData }) as any
        );
        toast.success("Project updated successfully");
      } else {
        await dispatch(createProject(projectData) as any);
        toast.success("Project created successfully");
      }

      handleCloseProjectModal();
    } catch (error: any) {
      console.error("Error saving project:", error);
      toast.error(error.message || "Failed to save project");
    }
  };

  const handleProjectEdit = (project: Project) => {
    setEditingProject(project);
    setProjectFormData({
      name: project.name,
      description: project.description || "",
      color: project.color || "#3B82F6",
      hourlyRate: project.hourlyRate !== null && project.hourlyRate !== undefined ? project.hourlyRate.toString() : "",
    });
    setShowProjectModal(true);
  };

  const handleProjectDelete = async (project: Project) => {
    if (window.confirm(`Are you sure you want to delete "${project.name}"?`)) {
      try {
        await dispatch(deleteProject(project.id) as any);
        toast.success("Project deleted successfully");
        // If we're currently viewing this project's tasks, go back to projects list
        if (selectedProject?.id === project.id) {
          navigate("/projects");
        }
      } catch (error: any) {
        console.error("Error deleting project:", error);
        toast.error(error.message || "Failed to delete project");
      }
    }
  };

  const handleCloseProjectModal = () => {
    setShowProjectModal(false);
    setEditingProject(null);
    setProjectFormData({
      name: "",
      description: "",
      color: "#3B82F6",
      hourlyRate: "",
    });
  };

  // Task handlers
  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskFormData.name.trim()) {
      toast.error("Task name is required");
      return;
    }

    if (!selectedProject) {
      toast.error("No project selected");
      return;
    }

    try {
      const taskData = {
        name: taskFormData.name.trim(),
        description: taskFormData.description.trim() || undefined,
        projectId: selectedProject.id,
        hourlyRate: taskFormData.hourlyRate
          ? parseFloat(taskFormData.hourlyRate)
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

      handleCloseTaskModal();
    } catch (error: any) {
      console.error("Error saving task:", error);
      toast.error(error.message || "Failed to save task");
    }
  };

  const handleTaskEdit = (task: Task) => {
    setEditingTask(task);
    setTaskFormData({
      name: task.name,
      description: task.description || "",
      hourlyRate: task.hourlyRate !== null && task.hourlyRate !== undefined ? task.hourlyRate.toString() : "",
    });
    setShowTaskModal(true);
  };

  const handleTaskToggleComplete = async (task: Task) => {
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

  const handleTaskDelete = async (task: Task) => {
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

  const handleCloseTaskModal = () => {
    setShowTaskModal(false);
    setEditingTask(null);
    setTaskFormData({
      name: "",
      description: "",
      hourlyRate: "",
    });
  };

  const handleProjectClick = (project: Project) => {
    navigate(`/projects/${project.id}`);
  };

  const handleBackToProjects = () => {
    navigate("/projects");
  };

  const handleLinkRepo = async (repo: {
    id: number;
    full_name: string;
    owner: string;
    name: string;
  }) => {
    if (!selectedProject) return;
    try {
      const result = await githubAPI.linkRepo(selectedProject.id, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.full_name,
      });
      // Refresh projects to get updated GitHub fields
      dispatch(fetchProjects());
      setShowRepoModal(false);
      toast.success(
        `Linked to ${repo.full_name}${
          result.webhookCreated ? "" : " (webhook skipped — set GITHUB_WEBHOOK_URL for auto-sync)"
        }`
      );
    } catch {
      toast.error("Failed to link repository");
    }
  };

  const handleUnlinkRepo = async () => {
    if (!selectedProject) return;
    if (!confirm("Unlink this repository? Existing tasks will be kept.")) return;
    try {
      await githubAPI.unlinkRepo(selectedProject.id);
      dispatch(fetchProjects());
      toast.success("Repository unlinked");
    } catch {
      toast.error("Failed to unlink repository");
    }
  };

  const handleSyncIssues = async () => {
    if (!selectedProject) return;
    try {
      const result = await dispatch(
        syncGitHubIssues(selectedProject.id)
      ).unwrap();
      dispatch(fetchTasks({ projectId: selectedProject.id }));
      toast.success(
        `Synced: ${result.imported} imported, ${result.updated} updated`
      );
    } catch {
      toast.error("Failed to sync issues");
    }
  };

  const colorOptions = [
    "#3B82F6", // Blue
    "#EF4444", // Red
    "#10B981", // Green
    "#F59E0B", // Yellow
    "#8B5CF6", // Purple
    "#EC4899", // Pink
    "#06B6D4", // Cyan
    "#84CC16", // Lime
  ];

  if (loading && projects.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-600">Manage your projects and tasks</p>
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

  // If a project is selected, show tasks view
  if (selectedProject) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToProjects}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{
                    backgroundColor: selectedProject.color || "#3B82F6",
                  }}
                ></div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {selectedProject.name} Tasks
                </h1>
              </div>
              <p className="text-gray-600">Manage tasks for this project</p>
              {/* GitHub repo link info */}
              {selectedProject.githubRepoFullName && (
                <div className="flex items-center gap-2 mt-1">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  <a
                    href={`https://github.com/${selectedProject.githubRepoFullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {selectedProject.githubRepoFullName}
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* GitHub actions */}
            {selectedProject.githubRepoFullName ? (
              <>
                <button
                  onClick={handleSyncIssues}
                  disabled={syncing}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                  title="Sync issues from GitHub"
                >
                  <ArrowPathIcon
                    className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                  />
                  {syncing ? "Syncing..." : "Sync Issues"}
                </button>
                <button
                  onClick={handleUnlinkRepo}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  title="Unlink repository"
                >
                  <LinkIcon className="h-4 w-4" />
                </button>
              </>
            ) : (
              githubConnected && (
                <button
                  onClick={() => setShowRepoModal(true)}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  Link Repo
                </button>
              )
            )}
            <button
              onClick={() => setShowTaskModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <PlusIcon className="h-5 w-5" />
              New Task
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {tasks.length === 0 && !loading ? (
          <div className="card p-6">
            <div className="text-gray-500 text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No tasks yet
              </h3>
              <p className="text-gray-600 mb-4">
                Create your first task for this project.
              </p>
              <button
                onClick={() => setShowTaskModal(true)}
                className="btn-primary flex items-center gap-2 mx-auto"
              >
                <PlusIcon className="h-5 w-5" />
                Create Task
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`card p-6 ${
                  task.isCompleted ? "bg-green-50 border-green-200" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <button
                      onClick={() => handleTaskToggleComplete(task)}
                      className={`mt-1 p-1 rounded-full transition-colors ${
                        task.isCompleted
                          ? "text-green-600 bg-green-100"
                          : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                      }`}
                    >
                      {task.isCompleted ? (
                        <CheckIcon className="h-5 w-5" />
                      ) : (
                        <div className="h-5 w-5 border-2 border-current rounded-full" />
                      )}
                    </button>
                    <div className="flex-1">
                      <h3
                        className={`text-lg font-semibold ${
                          task.isCompleted
                            ? "text-gray-500 line-through"
                            : "text-gray-900"
                        }`}
                      >
                        {task.name}
                      </h3>
                      {task.description && (
                        <p
                          className={`text-sm mt-1 ${
                            task.isCompleted ? "text-gray-400" : "text-gray-600"
                          }`}
                        >
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {task.githubIssueNumber && (
                          <a
                            href={task.githubIssueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="currentColor"
                              viewBox="0 0 16 16"
                            >
                              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                            </svg>
                            #{task.githubIssueNumber}
                          </a>
                        )}
                        <span>
                          Created{" "}
                          {new Date(task.createdAt).toLocaleDateString()}
                        </span>
                        {task.hourlyRate !== null && task.hourlyRate !== undefined && (
                          <span className="font-medium">
                            ${task.hourlyRate}/hr
                          </span>
                        )}
                        {task._count?.timeEntries && (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4" />
                            {task._count.timeEntries} entries
                          </span>
                        )}
                      </div>
                      {task.githubLabels && (() => {
                        try {
                          const labels = JSON.parse(task.githubLabels);
                          if (labels.length === 0) return null;
                          return (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {labels.map((label: string) => (
                                <span
                                  key={label}
                                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTaskEdit(task)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleTaskDelete(task)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Task Modal */}
        {showTaskModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {editingTask ? "Edit Task" : "Create New Task"}
                </h2>

                <form onSubmit={handleTaskSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Task Name *
                    </label>
                    <input
                      type="text"
                      value={taskFormData.name}
                      onChange={(e) =>
                        setTaskFormData({
                          ...taskFormData,
                          name: e.target.value,
                        })
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
                      value={taskFormData.description}
                      onChange={(e) =>
                        setTaskFormData({
                          ...taskFormData,
                          description: e.target.value,
                        })
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
                      value={taskFormData.hourlyRate}
                      onChange={(e) =>
                        setTaskFormData({
                          ...taskFormData,
                          hourlyRate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCloseTaskModal}
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

        {/* GitHub Repo Modal */}
        <GitHubRepoModal
          isOpen={showRepoModal}
          onClose={() => setShowRepoModal(false)}
          onSelect={handleLinkRepo}
        />
      </div>
    );
  }

  // Default projects list view
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600">Manage your projects and tasks</p>
        </div>
        <button
          onClick={() => setShowProjectModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          New Project
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {projects.length === 0 && !loading ? (
        <div className="card p-6">
          <div className="text-gray-500 text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No projects yet
            </h3>
            <p className="text-gray-600 mb-4">
              Create your first project to start organizing your time tracking.
            </p>
            <button
              onClick={() => setShowProjectModal(true)}
              className="btn-primary flex items-center gap-2 mx-auto"
            >
              <PlusIcon className="h-5 w-5" />
              Create Project
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="card p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handleProjectClick(project)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: project.color || "#3B82F6" }}
                  ></div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {project.name}
                  </h3>
                </div>
                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleProjectEdit(project)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleProjectDelete(project)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {project.description && (
                <p className="text-gray-600 text-sm mb-4">
                  {project.description}
                </p>
              )}

              {project.githubRepoFullName && (
                <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-500">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  {project.githubRepoFullName}
                </div>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </span>
                {project.hourlyRate !== null && project.hourlyRate !== undefined && (
                  <span className="font-medium">${project.hourlyRate}/hr</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {editingProject ? "Edit Project" : "Create New Project"}
              </h2>

              <form onSubmit={handleProjectSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectFormData.name}
                    onChange={(e) =>
                      setProjectFormData({
                        ...projectFormData,
                        name: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter project name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={projectFormData.description}
                    onChange={(e) =>
                      setProjectFormData({
                        ...projectFormData,
                        description: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter project description"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Color
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() =>
                          setProjectFormData({ ...projectFormData, color })
                        }
                        className={`w-8 h-8 rounded-full border-2 ${
                          projectFormData.color === color
                            ? "border-gray-900"
                            : "border-gray-300"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hourly Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={projectFormData.hourlyRate}
                    onChange={(e) =>
                      setProjectFormData({
                        ...projectFormData,
                        hourlyRate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleCloseProjectModal}
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
                      : editingProject
                      ? "Update Project"
                      : "Create Project"}
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

export default Projects;
