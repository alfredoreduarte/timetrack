import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "./useTypedDispatch";
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

export const useSocket = () => {
  const dispatch = useAppDispatch();
  const { token, isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      socketService.disconnect();
      return;
    }

    socketService.setHandlers({
      onTimeEntryStarted: (entry) => {
        dispatch(timerStartedFromSocket(entry));
        dispatch(entryCreatedFromSocket(entry));
        dispatch(fetchDashboardEarnings());
      },
      onTimeEntryStopped: (entry) => {
        dispatch(timerStoppedFromSocket());
        dispatch(entryUpdatedFromSocket(entry));
        dispatch(fetchDashboardEarnings());
      },
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
      onProjectCreated: (project) => {
        dispatch(projectCreatedFromSocket(project));
      },
      onProjectUpdated: (project) => {
        dispatch(projectUpdatedFromSocket(project));
      },
      onProjectDeleted: (data) => {
        dispatch(projectDeletedFromSocket(data));
      },
      onTaskCreated: (task) => {
        dispatch(taskCreatedFromSocket(task));
      },
      onTaskUpdated: (task) => {
        dispatch(taskUpdatedFromSocket(task));
      },
      onTaskDeleted: (data) => {
        dispatch(taskDeletedFromSocket(data));
      },
    });

    socketService.connect(token);

    return () => {
      socketService.disconnect();
    };
  }, [isAuthenticated, token, dispatch]);
};
