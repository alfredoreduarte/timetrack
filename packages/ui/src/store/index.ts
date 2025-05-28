import { configureStore } from "@reduxjs/toolkit";
import authSlice from "./slices/authSlice";
import timerSlice from "./slices/timerSlice";
import projectsSlice from "./slices/projectsSlice";
import timeEntriesSlice from "./slices/timeEntriesSlice";

export const store = configureStore({
  reducer: {
    auth: authSlice,
    timer: timerSlice,
    projects: projectsSlice,
    timeEntries: timeEntriesSlice,
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
