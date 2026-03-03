import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { AppDispatch, RootState } from "../store";
import { createFavorite } from "../store/slices/favoritesSlice";
import { fetchProjects, fetchTasks, Project, Task } from "../store/slices/projectsSlice";

interface AddFavoriteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AddFavoriteModal: React.FC<AddFavoriteModalProps> = ({
  isOpen,
  onClose,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { projects, tasks } = useSelector(
    (state: RootState) => state.projects
  );

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchProjects());
      setSelectedProjectId("");
      setSelectedTaskId("");
      setDescription("");
      setError(null);
    }
  }, [isOpen, dispatch]);

  useEffect(() => {
    if (selectedProjectId) {
      dispatch(fetchTasks({ projectId: selectedProjectId }));
      setSelectedTaskId("");
    }
  }, [selectedProjectId, dispatch]);

  const activeProjects = Array.isArray(projects)
    ? projects.filter((p: Project) => p.isActive)
    : [];

  const projectTasks = Array.isArray(tasks)
    ? tasks.filter((t: Task) => t.projectId === selectedProjectId)
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;

    setSubmitting(true);
    setError(null);

    try {
      await dispatch(
        createFavorite({
          projectId: selectedProjectId,
          taskId: selectedTaskId || undefined,
          description: description.trim() || undefined,
        })
      ).unwrap();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : null;
      setError(
        message || "Failed to create favorite. It may already exist."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Add Favorite</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project */}
          <div>
            <label
              htmlFor="fav-project"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Project *
            </label>
            <select
              id="fav-project"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              required
              className="input w-full"
            >
              <option value="">Select a project</option>
              {activeProjects.map((project: Project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Task */}
          {selectedProjectId && (
            <div>
              <label
                htmlFor="fav-task"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Task (Optional)
              </label>
              <select
                id="fav-task"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="input w-full"
              >
                <option value="">No task</option>
                {projectTasks.map((task: Task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label
              htmlFor="fav-description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Description (Optional)
            </label>
            <input
              id="fav-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="What will you be working on?"
              className="input w-full"
            />
            <p className="text-xs text-gray-400 mt-1">
              {description.length}/200
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedProjectId || submitting}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddFavoriteModal;
