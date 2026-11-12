import authSlice from "./slices/authSlice";
import timerSlice from "./slices/timerSlice";
import projectsSlice from "./slices/projectsSlice";
import timeEntriesSlice from "./slices/timeEntriesSlice";
import dashboardSlice from "./slices/dashboardSlice";
import reportsSlice from "./slices/reportsSlice";
import favoritesSlice from "./slices/favoritesSlice";
import apiKeysSlice from "./slices/apiKeysSlice";
import timersSlice from "./slices/timersSlice";

/** The one reducer map — used by the app store and by tests, so they can't drift. */
export const reducers = {
  auth: authSlice,
  timer: timerSlice,
  projects: projectsSlice,
  timeEntries: timeEntriesSlice,
  dashboard: dashboardSlice,
  reports: reportsSlice,
  favorites: favoritesSlice,
  apiKeys: apiKeysSlice,
  timers: timersSlice,
};
