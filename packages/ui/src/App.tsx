import React, { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "./store";
import { getCurrentUser } from "./store/slices/authSlice";
import { useTimer } from "./hooks/useTimer";
import { fetchProjects } from "./store/slices/projectsSlice";
import { fetchCurrentEntry, syncTimer } from "./store/slices/timerSlice";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import TimeEntries from "./pages/TimeEntries";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import ApiTest from "./pages/ApiTest";
import LoadingSpinner from "./components/LoadingSpinner";
import "./types/electron.d.ts"; // Import electron types

// Protected Route component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, isLoading, user, token, hasCheckedAuth } =
    useSelector((state: RootState) => state.auth);

  // Show loading only if we're loading and don't have any user data
  if (isLoading && !user) {
    return <LoadingSpinner />;
  }

  // If we have a token and user data (even if we haven't finished checking), allow access
  // This provides a better UX when we have cached data
  if (token && user) {
    return <>{children}</>;
  }

  // If we have a token but no user data and we're not loading, something went wrong
  if (token && !user && !isLoading && hasCheckedAuth) {
    return <Navigate to="/login" replace />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Public Route component (redirect to dashboard if authenticated)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);

  return isAuthenticated ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <>{children}</>
  );
};

// Component to handle Electron IPC events
const ElectronEventHandler: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { projects } = useSelector((state: RootState) => state.projects);

  // Use centralized timer hook
  const { isRunning, currentEntry, startTimer, stopTimer } = useTimer();

  useEffect(() => {
    // Setup Electron IPC listeners
    if (window.electronAPI && isAuthenticated) {
      const handleStartTimer = async () => {
        // Handle start timer from system tray or menu
        // Navigate to dashboard to show timer
        navigate("/dashboard");

        // If timer is already running, don't start a new one
        if (isRunning) {
          return;
        }

        // Load projects if not already loaded
        if (projects.length === 0) {
          await dispatch(fetchProjects());
        }

        // If there are projects, start timer with the first active project
        const activeProjects = projects.filter((p) => p.isActive);
        if (activeProjects.length > 0) {
          try {
            await startTimer({
              projectId: activeProjects[0].id,
              description: "Started from system menu",
            });
          } catch (error) {
            // Error is already logged in the hook
          }
        }
        // No projects available, just navigate to dashboard
        // User will see the project requirement notice
      };

      const handleStopTimer = async () => {
        // Handle stop timer from system tray or menu
        if (isRunning && currentEntry) {
          try {
            await stopTimer();
          } catch (error) {
            // Error is already logged in the hook
          }
        }
      };

      const handleNewProject = () => {
        // Handle new project from menu
        navigate("/projects");
      };

      window.electronAPI.onStartTimer(handleStartTimer);
      window.electronAPI.onStopTimer(handleStopTimer);
      window.electronAPI.onNewProject(handleNewProject);

      // Cleanup listeners on unmount
      return () => {
        if (window.electronAPI) {
          window.electronAPI.removeAllListeners("start-timer");
          window.electronAPI.removeAllListeners("stop-timer");
          window.electronAPI.removeAllListeners("new-project");
        }
      };
    }
  }, [
    dispatch,
    navigate,
    isAuthenticated,
    isRunning,
    currentEntry,
    projects,
    startTimer,
    stopTimer,
  ]);

  return null; // This component doesn't render anything
};

function AppContent() {
  const dispatch = useDispatch<AppDispatch>();
  const { token, user, hasCheckedAuth, isAuthenticated } = useSelector(
    (state: RootState) => state.auth
  );

  useEffect(() => {
    // Check if user is authenticated on app start
    if (token && !hasCheckedAuth) {
      // Always verify the token and refresh user data
      // This ensures we have the latest user information and validates the token
      dispatch(getCurrentUser());
    }
  }, [dispatch, token, hasCheckedAuth]);

  // Initialize timer when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchCurrentEntry());
    }
  }, [dispatch, isAuthenticated]);

  // Sync timer when page becomes visible (handles tab switching, window focus, etc.)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Use syncTimer for lightweight sync if timer is already running
        dispatch(syncTimer());
        // Also fetch current entry to ensure we have the latest data
        dispatch(fetchCurrentEntry());
      }
    };

    const handleFocus = () => {
      // Use syncTimer for lightweight sync if timer is already running
      dispatch(syncTimer());
      // Also fetch current entry to ensure we have the latest data
      dispatch(fetchCurrentEntry());
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [dispatch, isAuthenticated]);

  return (
    <>
      <ElectronEventHandler />
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:projectId" element={<Projects />} />
          <Route path="time-entries" element={<TimeEntries />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="api-test" element={<ApiTest />} />
        </Route>

        {/* Catch all route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppContent />
    </div>
  );
}

export default App;
