import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "../store";
import { socketService } from "../services/socket";
import {
  timerStartedFromSocket,
  timerStoppedFromSocket,
} from "../store/slices/timerSlice";
import {
  entryCreatedFromSocket,
  entryUpdatedFromSocket,
  entryDeletedFromSocket,
} from "../store/slices/timeEntriesSlice";
import {
  projectCreatedFromSocket,
  projectUpdatedFromSocket,
  projectDeletedFromSocket,
  taskCreatedFromSocket,
  taskUpdatedFromSocket,
  taskDeletedFromSocket,
} from "../store/slices/projectsSlice";
import { fetchDashboardEarnings } from "../store/slices/dashboardSlice";

export function useSocket() {
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated, token } = useSelector(
    (state: RootState) => state.auth
  );
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      // Disconnect if not authenticated
      if (isConnectedRef.current) {
        socketService.disconnect();
        isConnectedRef.current = false;
      }
      return;
    }

    // Already connected
    if (isConnectedRef.current) {
      return;
    }

    // Set up event handlers
    socketService.setHandlers({
      // Timer events
      onTimeEntryStarted: (entry) => {
        dispatch(timerStartedFromSocket(entry));
      },
      onTimeEntryStopped: (entry) => {
        dispatch(timerStoppedFromSocket());
        dispatch(entryUpdatedFromSocket(entry));
        // Refresh earnings when timer stops
        dispatch(fetchDashboardEarnings());
      },

      // Time entry events (manual entries)
      onTimeEntryCreated: (entry) => {
        dispatch(entryCreatedFromSocket(entry));
        dispatch(fetchDashboardEarnings());
      },
      onTimeEntryUpdated: (entry) => {
        dispatch(entryUpdatedFromSocket(entry));
        dispatch(fetchDashboardEarnings());
      },
      onTimeEntryDeleted: (data) => {
        dispatch(entryDeletedFromSocket(data));
        dispatch(fetchDashboardEarnings());
      },

      // Project events
      onProjectCreated: (project) => {
        dispatch(projectCreatedFromSocket(project));
      },
      onProjectUpdated: (project) => {
        dispatch(projectUpdatedFromSocket(project));
      },
      onProjectDeleted: (data) => {
        dispatch(projectDeletedFromSocket(data));
        dispatch(fetchDashboardEarnings());
      },

      // Task events
      onTaskCreated: (task) => {
        dispatch(taskCreatedFromSocket(task));
      },
      onTaskUpdated: (task) => {
        dispatch(taskUpdatedFromSocket(task));
      },
      onTaskDeleted: (data) => {
        dispatch(taskDeletedFromSocket(data));
        dispatch(fetchDashboardEarnings());
      },
    });

    // Connect
    socketService.connect(token);
    isConnectedRef.current = true;

    // Cleanup on unmount
    return () => {
      socketService.disconnect();
      isConnectedRef.current = false;
    };
  }, [isAuthenticated, token, dispatch]);
}
