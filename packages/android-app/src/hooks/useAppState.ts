import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAppDispatch, useAppSelector } from "./useTypedDispatch";
import { syncTimer } from "../store/slices/timerSlice";
import { fetchDashboardEarnings } from "../store/slices/dashboardSlice";

export const useAppState = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        // App came to foreground
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active" &&
          isAuthenticated
        ) {
          dispatch(syncTimer());
          dispatch(fetchDashboardEarnings());
        }
        appState.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, dispatch]);
};
