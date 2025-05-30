import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import TimeEntries from "../TimeEntries";
import authSlice from "../../store/slices/authSlice";
import timerSlice from "../../store/slices/timerSlice";
import projectsSlice from "../../store/slices/projectsSlice";
import timeEntriesSlice from "../../store/slices/timeEntriesSlice";
import dashboardSlice from "../../store/slices/dashboardSlice";
import * as timeEntriesActions from "../../store/slices/timeEntriesSlice";
import * as projectsActions from "../../store/slices/projectsSlice";

// Mock the Timer component
vi.mock("../../components/Timer", () => ({
  default: () => <div data-testid="timer-component">Timer Component</div>,
}));

// Mock the API
vi.mock("../../services/api", () => ({
  timeEntriesAPI: {
    getTimeEntries: vi.fn(),
    deleteTimeEntry: vi.fn(),
  },
  projectsAPI: {
    getProjects: vi.fn(),
  },
}));

const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      auth: authSlice,
      timer: timerSlice,
      projects: projectsSlice,
      timeEntries: timeEntriesSlice,
      dashboard: dashboardSlice,
    },
    preloadedState: {
      auth: {
        user: { id: "1", email: "test@example.com", name: "Test User" },
        token: "mock-token",
        isAuthenticated: true,
        isLoading: false,
        error: null,
        hasCheckedAuth: true,
      },
      timer: {
        isRunning: false,
        elapsedTime: 0,
        currentEntry: null,
        loading: false,
        error: null,
      },
      projects: {
        projects: [
          {
            id: "1",
            name: "Test Project",
            description: "Test project description",
            color: "#3B82F6",
            hourlyRate: 50,
            isActive: true,
            createdAt: "2023-01-01T00:00:00Z",
            updatedAt: "2023-01-01T00:00:00Z",
          },
        ],
        tasks: [],
        loading: false,
        error: null,
      },
      timeEntries: {
        entries: [],
        currentEntry: null,
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          pages: 0,
        },
        loading: false,
        error: null,
      },
      dashboard: {
        earnings: null,
        loading: false,
        error: null,
      },
      ...initialState,
    },
  });
};

const renderWithProviders = (
  component: React.ReactElement,
  initialState = {}
) => {
  const store = createTestStore(initialState);

  // Mock the dispatch calls to prevent state changes during component mount
  const originalDispatch = store.dispatch;
  store.dispatch = vi.fn().mockImplementation((action) => {
    // Prevent fetchTimeEntries and fetchProjects from executing
    if (
      action.type?.startsWith("timeEntries/fetchTimeEntries") ||
      action.type?.startsWith("projects/fetchProjects")
    ) {
      return { type: "mocked", payload: null };
    }
    return originalDispatch(action);
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <BrowserRouter>{component}</BrowserRouter>
      </Provider>
    ),
  };
};

describe("TimeEntries Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("Component Rendering", () => {
    it("shows the main interface when rendered", () => {
      renderWithProviders(<TimeEntries />);

      expect(
        screen.getByRole("heading", { name: "Time Entries" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("View and manage your time tracking records")
      ).toBeInTheDocument();
      expect(screen.getByTestId("timer-component")).toBeInTheDocument();
    });
  });

  describe("API Response Format Handling", () => {
    it("handles backend response format mismatch gracefully", () => {
      // Simulate the old API response format that returns undefined or wrong structure
      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: [], // This would be undefined in real API mismatch scenario
          currentEntry: null,
          pagination: undefined, // API doesn't return pagination in old format
          loading: false,
          error: null,
        },
      });

      // Should not crash and show empty state
      expect(screen.getByText("Time Entries (0)")).toBeInTheDocument();
      expect(screen.getByText("No time entries found")).toBeInTheDocument();
    });

    it("handles empty API response gracefully", () => {
      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: null, // Simulate API returning null
          currentEntry: null,
          pagination: null,
          loading: false,
          error: null,
        },
      });

      expect(screen.getByText("Time Entries (0)")).toBeInTheDocument();
      expect(screen.getByText("No time entries found")).toBeInTheDocument();
    });
  });

  describe("Pagination Handling", () => {
    it("handles undefined pagination gracefully", () => {
      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: [],
          currentEntry: null,
          pagination: undefined, // Simulate undefined pagination
          loading: false,
          error: null,
        },
      });

      // Should show "Time Entries (0)" instead of crashing
      expect(screen.getByText("Time Entries (0)")).toBeInTheDocument();
      expect(screen.getByText("No time entries found")).toBeInTheDocument();
    });

    it("displays correct total count when pagination is available", () => {
      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: [],
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 42,
            pages: 1,
          },
          loading: false,
          error: null,
        },
      });

      expect(screen.getByText("Time Entries (42)")).toBeInTheDocument();
    });
  });

  describe("Time Entries Display", () => {
    it("shows empty state when no entries are available", () => {
      renderWithProviders(<TimeEntries />);

      expect(screen.getByText("No time entries found")).toBeInTheDocument();
      expect(
        screen.getByText("Start tracking time to see your entries here.")
      ).toBeInTheDocument();
    });

    it("displays time entries when available", () => {
      const mockEntries = [
        {
          id: "1",
          description: "Working on feature X",
          startTime: "2023-01-01T10:00:00Z",
          endTime: "2023-01-01T11:00:00Z",
          duration: 3600,
          projectId: "1",
          userId: "1",
          project: {
            id: "1",
            name: "Test Project",
            color: "#3B82F6",
          },
          createdAt: "2023-01-01T10:00:00Z",
          updatedAt: "2023-01-01T11:00:00Z",
        },
      ];

      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: mockEntries,
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 1,
            pages: 1,
          },
          loading: false,
          error: null,
        },
      });

      expect(screen.getByText("Working on feature X")).toBeInTheDocument();
      expect(screen.getByText("Test Project")).toBeInTheDocument();
      expect(screen.getByText("1h 0m")).toBeInTheDocument();
    });

    it("displays earnings when project has hourly rate", () => {
      const mockEntries = [
        {
          id: "1",
          description: "Working on feature X",
          startTime: "2023-01-01T10:00:00Z",
          endTime: "2023-01-01T11:00:00Z",
          duration: 3600, // 1 hour
          projectId: "1",
          userId: "1",
          project: {
            id: "1",
            name: "Test Project",
            color: "#3B82F6",
          },
          createdAt: "2023-01-01T10:00:00Z",
          updatedAt: "2023-01-01T11:00:00Z",
        },
      ];

      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: mockEntries,
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 1,
            pages: 1,
          },
          loading: false,
          error: null,
        },
      });

      // Should show $50.00 (1 hour * $50/hour)
      expect(screen.getByText("$50.00")).toBeInTheDocument();
    });

    it("shows delete button only for completed entries", () => {
      const mockEntries = [
        {
          id: "1",
          description: "Completed entry",
          startTime: "2023-01-01T10:00:00Z",
          endTime: "2023-01-01T11:00:00Z",
          duration: 3600,
          projectId: "1",
          userId: "1",
          project: {
            id: "1",
            name: "Test Project",
            color: "#3B82F6",
          },
          createdAt: "2023-01-01T10:00:00Z",
          updatedAt: "2023-01-01T11:00:00Z",
        },
        {
          id: "2",
          description: "Running entry",
          startTime: "2023-01-01T12:00:00Z",
          endTime: null, // No end time - still running
          duration: 1800,
          projectId: "1",
          userId: "1",
          project: {
            id: "1",
            name: "Test Project",
            color: "#3B82F6",
          },
          createdAt: "2023-01-01T12:00:00Z",
          updatedAt: "2023-01-01T12:30:00Z",
        },
      ];

      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: mockEntries,
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 2,
            pages: 1,
          },
          loading: false,
          error: null,
        },
      });

      const deleteButtons = screen.getAllByTitle("Delete entry");
      expect(deleteButtons).toHaveLength(1); // Only one delete button for completed entry
    });
  });

  describe("Filtering", () => {
    it("shows and hides filters when toggle button is clicked", () => {
      renderWithProviders(<TimeEntries />);

      const toggleButton = screen.getByText("Show Filters");
      expect(screen.queryByText("Filters")).not.toBeInTheDocument();

      fireEvent.click(toggleButton);

      expect(screen.getByText("Filters")).toBeInTheDocument();
      expect(screen.getByText("Hide Filters")).toBeInTheDocument();
      expect(screen.getByDisplayValue("")).toBeInTheDocument(); // Check for select element instead of label
    });
  });

  describe("Loading States", () => {
    it("shows loading spinner when loading and no entries", () => {
      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: [],
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 0,
            pages: 0,
          },
          loading: true,
          error: null,
        },
      });

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    });

    it("shows load more button with entries and more pages", () => {
      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: [
            {
              id: "1",
              description: "Test entry",
              startTime: "2023-01-01T10:00:00Z",
              endTime: "2023-01-01T11:00:00Z",
              duration: 3600,
              projectId: "1",
              userId: "1",
              createdAt: "2023-01-01T10:00:00Z",
              updatedAt: "2023-01-01T11:00:00Z",
            },
          ],
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 100,
            pages: 2,
          },
          loading: false,
          error: null,
        },
      });

      expect(screen.getByText("Load More")).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("displays error message when API call fails", () => {
      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: [],
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 0,
            pages: 0,
          },
          loading: false,
          error: "Failed to fetch time entries",
        },
      });

      expect(
        screen.getByText("Failed to fetch time entries")
      ).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("handles entry with no project gracefully", () => {
      const mockEntries = [
        {
          id: "1",
          description: "Entry without project",
          startTime: "2023-01-01T10:00:00Z",
          endTime: "2023-01-01T11:00:00Z",
          duration: 3600,
          projectId: undefined,
          userId: "1",
          project: undefined,
          createdAt: "2023-01-01T10:00:00Z",
          updatedAt: "2023-01-01T11:00:00Z",
        },
      ];

      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: mockEntries,
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 1,
            pages: 1,
          },
          loading: false,
          error: null,
        },
      });

      expect(screen.getByText("No Project")).toBeInTheDocument();
      expect(screen.getByText("Entry without project")).toBeInTheDocument();
    });

    it("handles very long duration formatting correctly", () => {
      const mockEntries = [
        {
          id: "1",
          description: "Long entry",
          startTime: "2023-01-01T10:00:00Z",
          endTime: "2023-01-01T18:00:00Z",
          duration: 28800, // 8 hours
          projectId: "1",
          userId: "1",
          project: {
            id: "1",
            name: "Test Project",
            color: "#3B82F6",
          },
          createdAt: "2023-01-01T10:00:00Z",
          updatedAt: "2023-01-01T18:00:00Z",
        },
      ];

      renderWithProviders(<TimeEntries />, {
        timeEntries: {
          entries: mockEntries,
          currentEntry: null,
          pagination: {
            page: 1,
            limit: 50,
            total: 1,
            pages: 1,
          },
          loading: false,
          error: null,
        },
      });

      expect(screen.getByText("8h 0m")).toBeInTheDocument();
    });
  });
});
