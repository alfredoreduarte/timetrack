import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../store";
import { updateProfile } from "../store/slices/authSlice";
import { toast } from "react-hot-toast";

const Settings: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user, isLoading, error } = useSelector(
    (state: RootState) => state.auth
  );

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    defaultHourlyRate: "",
    idleTimeoutMinutes: "",
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      const idleMinutes =
        user.idleTimeoutSeconds !== null &&
        user.idleTimeoutSeconds !== undefined
          ? Math.round(user.idleTimeoutSeconds / 60).toString()
          : "10";

      setFormData({
        name: user.name || "",
        email: user.email || "",
        defaultHourlyRate:
          user.defaultHourlyRate !== null &&
          user.defaultHourlyRate !== undefined
            ? user.defaultHourlyRate.toString()
            : "",
        idleTimeoutMinutes: idleMinutes,
      });
    }
  }, [user]);

  // Check if form has changes
  useEffect(() => {
    if (user) {
      const hasNameChange = formData.name !== (user.name || "");
      const hasEmailChange = formData.email !== (user.email || "");
      const hasRateChange =
        formData.defaultHourlyRate !==
        (user.defaultHourlyRate !== null &&
        user.defaultHourlyRate !== undefined
          ? user.defaultHourlyRate.toString()
          : "");
      const currentIdleMinutes =
        user.idleTimeoutSeconds !== null &&
        user.idleTimeoutSeconds !== undefined
          ? Math.round(user.idleTimeoutSeconds / 60).toString()
          : "10";
      const hasIdleTimeoutChange =
        formData.idleTimeoutMinutes !== currentIdleMinutes;

      setHasChanges(
        hasNameChange || hasEmailChange || hasRateChange || hasIdleTimeoutChange
      );
    }
  }, [formData, user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasChanges) {
      return;
    }

    // Prepare update data (only include changed fields)
    const updateData: {
      name?: string;
      email?: string;
      defaultHourlyRate?: number;
      idleTimeoutSeconds?: number;
    } = {};

    if (formData.name !== (user?.name || "")) {
      updateData.name = formData.name.trim();
    }

    if (formData.email !== (user?.email || "")) {
      updateData.email = formData.email.trim();
    }

    if (
      formData.defaultHourlyRate !== (user?.defaultHourlyRate?.toString() || "")
    ) {
      const rate = parseFloat(formData.defaultHourlyRate);
      if (!isNaN(rate) && rate >= 0) {
        updateData.defaultHourlyRate = rate;
      } else if (formData.defaultHourlyRate === "") {
        updateData.defaultHourlyRate = undefined;
      }
    }

    const userIdleMinutes =
      user?.idleTimeoutSeconds !== null && user?.idleTimeoutSeconds !== undefined
        ? Math.round(user.idleTimeoutSeconds / 60).toString()
        : "10";

    if (formData.idleTimeoutMinutes !== userIdleMinutes) {
      const minutes = parseInt(formData.idleTimeoutMinutes, 10);
      if (
        isNaN(minutes) ||
        minutes < 1 ||
        minutes > 120 ||
        formData.idleTimeoutMinutes === ""
      ) {
        toast.error("Idle timeout must be between 1 and 120 minutes.");
        return;
      }
      updateData.idleTimeoutSeconds = minutes * 60;
    }

    try {
      await dispatch(updateProfile(updateData)).unwrap();
      toast.success("Profile updated successfully!");
    } catch (error: any) {
      toast.error(error || "Failed to update profile");
    }
  };

  const resetForm = () => {
    if (user) {
      const idleMinutes =
        user.idleTimeoutSeconds !== null &&
        user.idleTimeoutSeconds !== undefined
          ? Math.round(user.idleTimeoutSeconds / 60).toString()
          : "10";
      setFormData({
        name: user.name || "",
        email: user.email || "",
        defaultHourlyRate:
          user.defaultHourlyRate !== null &&
          user.defaultHourlyRate !== undefined
            ? user.defaultHourlyRate.toString()
            : "",
        idleTimeoutMinutes: idleMinutes,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Profile</h3>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="input-field mt-1"
                placeholder="Your name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="input-field mt-1"
                placeholder="Your email"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Default Hourly Rate
              </label>
              <div className="mt-1 relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                  $
                </span>
                <input
                  type="number"
                  name="defaultHourlyRate"
                  value={formData.defaultHourlyRate}
                  onChange={handleInputChange}
                  className="input-field pl-8"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                This will be used as the default rate for new projects and tasks
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Idle Timeout (minutes)
              </label>
              <input
                type="number"
                name="idleTimeoutMinutes"
                value={formData.idleTimeoutMinutes}
                onChange={handleInputChange}
                className="input-field mt-1"
                placeholder="10"
                min="1"
                max="120"
                step="1"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Stop running timers automatically after this many minutes of inactivity.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={!hasChanges || isLoading}
                className={`btn-primary ${
                  !hasChanges || isLoading
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                {isLoading ? "Saving..." : "Save Changes"}
              </button>

              {hasChanges && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary"
                >
                  Reset
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Preferences
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Email notifications
              </span>
              <input type="checkbox" className="rounded" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Desktop notifications
              </span>
              <input type="checkbox" className="rounded" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Auto-start timer
              </span>
              <input type="checkbox" className="rounded" />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Account Info
            </h4>
            <div className="text-xs text-gray-500 space-y-1">
              <div>User ID: {user?.id}</div>
              <div>
                Member since:{" "}
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "N/A"}
              </div>
              <div>
                Last updated:{" "}
                {user?.updatedAt
                  ? new Date(user.updatedAt).toLocaleDateString()
                  : "N/A"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
