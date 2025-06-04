import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store";
import { getCurrentUser } from "../../store/slices/authSlice";
import { fetchCurrentEntry } from "../../store/slices/timerSlice";
import { useTimer } from "../../hooks/useTimer";
import ElectronTimerForm from "./ElectronTimerForm";
import ElectronTimerDisplay from "./ElectronTimerDisplay";
import ElectronRecentTimers from "./ElectronRecentTimers";
import ElectronLoginForm from "./ElectronLoginForm";
import ElectronRegisterForm from "./ElectronRegisterForm";
import LoadingSpinner from "../LoadingSpinner";

const ElectronApp: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated, isLoading, token, hasCheckedAuth } = useSelector(
    (state: RootState) => state.auth
  );
  const { isRunning } = useTimer();
  const [showRegister, setShowRegister] = useState(false);

  // Detect if we're on macOS for proper padding
  const isMacOS = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  useEffect(() => {
    // Check if user is authenticated on app start
    if (token && !hasCheckedAuth) {
      dispatch(getCurrentUser());
    }
  }, [dispatch, token, hasCheckedAuth]);

  // Initialize timer when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchCurrentEntry());
    }
  }, [dispatch, isAuthenticated]);

  // Show loading only if we're loading and haven't checked auth yet
  if (isLoading && !hasCheckedAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  // Show login/register forms if not authenticated
  if (!isAuthenticated) {
    if (showRegister) {
      return (
        <ElectronRegisterForm onShowLogin={() => setShowRegister(false)} />
      );
    }

    return <ElectronLoginForm onShowRegister={() => setShowRegister(true)} />;
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header: Timer Form or Running Timer Display - Draggable Region */}
      <div className={`drag-region ${!isRunning && isMacOS ? "pt-12" : ""}`}>
        {isRunning ? <ElectronTimerDisplay /> : <ElectronTimerForm />}
      </div>

      {/* Body: Recent Timers List */}
      <ElectronRecentTimers />
    </div>
  );
};

export default ElectronApp;
