import { configureStore } from "@reduxjs/toolkit";
import authSlice from "./slices/authSlice";
import timerSlice from "./slices/timerSlice";
import projectsSlice from "./slices/projectsSlice";
import timeEntriesSlice from "./slices/timeEntriesSlice";
import dashboardSlice from "./slices/dashboardSlice";
import reportsSlice from "./slices/reportsSlice";
import githubSlice from "./slices/githubSlice";

export const store = configureStore({
  reducer: {
    auth: authSlice,
    timer: timerSlice,
    projects: projectsSlice,
    timeEntries: timeEntriesSlice,
    dashboard: dashboardSlice,
    reports: reportsSlice,
    github: githubSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["persist/PERSIST"],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
