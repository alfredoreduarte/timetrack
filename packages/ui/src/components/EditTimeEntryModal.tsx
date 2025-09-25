import React, { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { TimeEntry } from "../store/slices/timeEntriesSlice";
import { Project, Task } from "../store/slices/projectsSlice";
import api from "../services/api";

interface EditTimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: TimeEntry;
  projects: Project[];
  tasks: Task[];
  onSave: (updatedEntry: TimeEntry) => void;
}

const EditTimeEntryModal: React.FC<EditTimeEntryModalProps> = ({
  isOpen,
  onClose,
  entry,
  projects,
  tasks,
  onSave,
}) => {
  const [description, setDescription] = useState(entry.description || "");
  const [projectId, setProjectId] = useState(entry.projectId || "");
  const [taskId, setTaskId] = useState(entry.taskId || "");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hours, setHours] = useState("");
  const [useHours, setUseHours] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filter tasks based on selected project
  const filteredTasks = taskId
    ? tasks.filter((task) => task.projectId === projectId)
    : tasks;

  useEffect(() => {
    if (entry.startTime) {
      const start = new Date(entry.startTime);
      setStartDate(start.toISOString().split("T")[0]);
      setStartTime(start.toTimeString().slice(0, 5));
    }
    if (entry.endTime) {
      const end = new Date(entry.endTime);
      setEndDate(end.toISOString().split("T")[0]);
      setEndTime(end.toTimeString().slice(0, 5));

      // Calculate hours
      if (entry.duration) {
        const durationHours = (entry.duration / 3600).toFixed(2);
        setHours(durationHours);
      }
    }
  }, [entry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const updateData: any = {
        description: description || null,
        projectId: projectId || null,
        taskId: taskId || null,
      };

      // Handle time updates
      if (startDate && startTime) {
        const startDateTime = new Date(`${startDate}T${startTime}`);
        updateData.startTime = startDateTime.toISOString();
      }

      if (useHours && hours) {
        // Use hours to calculate end time
        updateData.hours = parseFloat(hours);
      } else if (endDate && endTime) {
        // Use explicit end time
        const endDateTime = new Date(`${endDate}T${endTime}`);
        updateData.endTime = endDateTime.toISOString();
      }

      const response = await api.timeEntries.updateTimeEntry(entry.id, updateData);
      onSave(response);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update time entry");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Edit Time Entry
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="What did you work on?"
            />
          </div>

          {/* Project and Task */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  // Clear task if project changes
                  if (taskId) setTaskId("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No Project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Task
              </label>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!projectId}
              >
                <option value="">No Task</option>
                {filteredTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Duration Method Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration Method
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={!useHours}
                  onChange={() => setUseHours(false)}
                  className="mr-2"
                />
                <span>End Time</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={useHours}
                  onChange={() => setUseHours(true)}
                  className="mr-2"
                />
                <span>Hours Duration</span>
              </label>
            </div>
          </div>

          {/* End Time or Hours */}
          {useHours ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duration (hours)
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 2.5"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Entry will end {hours ? parseFloat(hours).toFixed(2) : "0"} hours after start time
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTimeEntryModal;