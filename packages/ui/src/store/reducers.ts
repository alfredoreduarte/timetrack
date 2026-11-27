import { combineReducers } from "@reduxjs/toolkit";
import authSlice, { logout } from "./slices/authSlice";
import timerSlice from "./slices/timerSlice";
import projectsSlice from "./slices/projectsSlice";
import timeEntriesSlice from "./slices/timeEntriesSlice";
import dashboardSlice from "./slices/dashboardSlice";
import reportsSlice from "./slices/reportsSlice";
import favoritesSlice from "./slices/favoritesSlice";
import apiKeysSlice from "./slices/apiKeysSlice";
import timersSlice from "./slices/timersSlice";

const sliceReducers = {
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

const appReducer = combineReducers(sliceReducers);

/**
 * The one root reducer, used by the app store and by tests so they can't
 * drift. Signing out starts every slice over, so the next account in this
 * tab never sees the last one's timers, projects or reports (sessionGuard
 * drops answers to requests the last account still had in flight).
 */
export const reducers: typeof appReducer = (state, action) =>
  appReducer(action.type === logout.type ? undefined : state, action);
