import { useEffect, useRef, useCallback } from "react";
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
import {
  favoriteCreatedFromSocket,
  favoriteDeletedFromSocket,
  favoriteUpdatedFromSocket,
  favoritesReorderedFromSocket,
} from "../store/slices/favoritesSlice";

export function useSocket() {
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated, token } = useSelector(
    (state: RootState) => state.auth
  );
  const isConnectedRef = useRef(false);

  // Debounce earnings refresh — multiple socket events can fire in quick
  // succession (e.g. bulk operations), and each was dispatching its own
  // fetchDashboardEarnings, burning through the rate limit.
  const earningsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const debouncedFetchEarnings = useCallback(() => {
    if (earningsTimerRef.current) clearTimeout(earningsTimerRef.current);
    earningsTimerRef.current = setTimeout(() => {
      if (!cancelledRef.current) {
        dispatch(fetchDashboardEarnings());
      }
    }, 2000);
  }, [dispatch]);

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
        debouncedFetchEarnings();
      },

      // Time entry events (manual entries)
      onTimeEntryCreated: (entry) => {
        dispatch(entryCreatedFromSocket(entry));
        debouncedFetchEarnings();
      },
      onTimeEntryUpdated: (entry) => {
        dispatch(entryUpdatedFromSocket(entry));
        debouncedFetchEarnings();
      },
      onTimeEntryDeleted: (data) => {
        dispatch(entryDeletedFromSocket(data));
        debouncedFetchEarnings();
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
        debouncedFetchEarnings();
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
        debouncedFetchEarnings();
      },

      // Favorite events
      onFavoriteCreated: (favorite) => {
        dispatch(favoriteCreatedFromSocket(favorite));
      },
      onFavoriteDeleted: (data) => {
        dispatch(favoriteDeletedFromSocket(data));
      },
      onFavoriteUpdated: (favorite) => {
        dispatch(favoriteUpdatedFromSocket(favorite));
      },
      onFavoritesReordered: (favorites) => {
        dispatch(favoritesReorderedFromSocket(favorites));
      },
    });

    // Connect
    socketService.connect(token);
    isConnectedRef.current = true;

    // Cleanup on unmount — set cancellation flag before disconnecting so any
    // lingering socket event that fires during the disconnect handshake cannot
    // schedule a new debounced fetch into logged-out state.
    cancelledRef.current = false; // reset on each connection
    return () => {
      cancelledRef.current = true;
      socketService.disconnect();
      isConnectedRef.current = false;
      if (earningsTimerRef.current) clearTimeout(earningsTimerRef.current);
    };
  }, [isAuthenticated, token, dispatch, debouncedFetchEarnings]);
}
