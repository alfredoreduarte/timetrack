import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useSearchParams } from "react-router-dom";
import { RootState, AppDispatch } from "../store";
import { updateProfile } from "../store/slices/authSlice";
import {
  fetchGitHubStatus,
  disconnectGitHub,
} from "../store/slices/githubSlice";
import { githubAPI } from "../services/api";
import { toast } from "react-hot-toast";

const Settings: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user, isLoading, error } = useSelector(
    (state: RootState) => state.auth
  );
  const github = useSelector((state: RootState) => state.github);
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Fetch GitHub status on mount
  useEffect(() => {
    dispatch(fetchGitHubStatus());
  }, [dispatch]);

  // Handle GitHub OAuth callback
  useEffect(() => {
    if (searchParams.get("github") === "connected") {
      toast.success("GitHub connected successfully!");
      dispatch(fetchGitHubStatus());
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, dispatch, setSearchParams]);

  const handleConnectGitHub = async () => {
    try {
      const { url } = await githubAPI.getAuthUrl();
      window.location.href = url;
    } catch {
      toast.error("Failed to start GitHub connection");
    }
  };

  const handleDisconnectGitHub = async () => {
    if (!confirm("Disconnect GitHub? This will unlink all repositories.")) {
      return;
    }
    try {
      await dispatch(disconnectGitHub()).unwrap();
      toast.success("GitHub disconnected");
    } catch {
      toast.error("Failed to disconnect GitHub");
    }
  };

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

        {/* GitHub Integration */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            GitHub Integration
          </h3>
          {github.connected ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                {github.avatarUrl && (
                  <img
                    src={github.avatarUrl}
                    className="w-8 h-8 rounded-full"
                    alt=""
                  />
                )}
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {github.username}
                  </span>
                  <span className="ml-2 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Link repositories to projects in the Projects page to
                auto-import issues as tasks.
              </p>
              <button
                onClick={handleDisconnectGitHub}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Disconnect GitHub
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Connect your GitHub account to link repositories and
                auto-import issues as tasks.
              </p>
              <button
                onClick={handleConnectGitHub}
                className="btn-primary inline-flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                Connect GitHub
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
