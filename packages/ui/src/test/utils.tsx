import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import authSlice from "../store/slices/authSlice";
import timerSlice from "../store/slices/timerSlice";
import projectsSlice from "../store/slices/projectsSlice";
import timeEntriesSlice from "../store/slices/timeEntriesSlice";

// Create a custom render function that includes providers
interface ExtendedRenderOptions extends Omit<RenderOptions, "wrapper"> {
  store?: any;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    store = configureStore({
      reducer: {
        auth: authSlice,
        timer: timerSlice,
        projects: projectsSlice,
        timeEntries: timeEntriesSlice,
      },
    }),
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <BrowserRouter>{children}</BrowserRouter>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

// Create a mock store with authenticated state
export function createMockStore() {
  const store = configureStore({
    reducer: {
      auth: authSlice,
      timer: timerSlice,
      projects: projectsSlice,
      timeEntries: timeEntriesSlice,
    },
  });

  // Dispatch actions to set up the authenticated state
  store.dispatch({
    type: "auth/setCredentials",
    payload: {
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
      },
      token: "mock-jwt-token",
    },
  });

  // Set up projects using the correct action type
  store.dispatch({
    type: "projects/fetchProjects/fulfilled",
    payload: [
      {
        id: "project-1",
        name: "Test Project 1",
        description: "A test project",
        isActive: true,
        hourlyRate: 50,
        userId: "user-1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "project-2",
        name: "Test Project 2",
        description: "Another test project",
        isActive: true,
        hourlyRate: 75,
        userId: "user-1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
  });

  // Set up tasks using the correct action type
  store.dispatch({
    type: "projects/fetchTasks/fulfilled",
    payload: [
      {
        id: "task-1",
        name: "Test Task 1",
        description: "A test task",
        projectId: "project-1",
        hourlyRate: 60,
        isActive: true,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
  });

  return store;
}

// Re-export everything
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
