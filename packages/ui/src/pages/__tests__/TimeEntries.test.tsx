import React from "react";
import { render, screen, fireEvent, waitFor, getDefaultNormalizer } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import TimeEntries from "../TimeEntries";
import { money } from "../../utils/agentFormat";

// Amounts are formatted in the runner's locale; match them as rendered.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };
import { reducers } from "../../store/reducers";
import { projectsAPI, tasksAPI, timeEntriesAPI } from "../../services/api";

// Mock the Timer component
vi.mock("../../components/Timer", () => ({
  default: () => <div data-testid="timer-component">Timer Component</div>,
}));

// Mock the API calls the page makes on mount
vi.mock("../../services/api", () => ({
  timeEntriesAPI: {
    getTimeEntries: vi.fn(),
    deleteTimeEntry: vi.fn(),
  },
  projectsAPI: {
    getProjects: vi.fn(),
  },
  tasksAPI: {
    getTasks: vi.fn(),
  },
}));

type TimeEntriesResponse = Awaited<ReturnType<typeof timeEntriesAPI.getTimeEntries>>;
type MockEntry = TimeEntriesResponse["entries"][number];

const testProject = {
  id: "1",
  name: "Test Project",
  description: "Test project description",
  color: "#3B82F6",
  hourlyRate: 50,
  isActive: true,
  createdAt: "2023-01-01T00:00:00Z",
  updatedAt: "2023-01-01T00:00:00Z",
};

const pagination = (total: number, pages = total > 0 ? 1 : 0) => ({
  page: 1,
  limit: 50,
  total,
  pages,
});

const completedEntry = (overrides: Partial<MockEntry> = {}): MockEntry => ({
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
  ...overrides,
});

/** What GET /time-entries returns for the page's mount fetch. */
const respondWith = (response: unknown) => {
  vi.mocked(timeEntriesAPI.getTimeEntries).mockResolvedValue(
    response as TimeEntriesResponse
  );
};

const createTestStore = () => {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      auth: {
        user: { id: "1", email: "test@example.com", name: "Test User" },
        token: "mock-token",
        isAuthenticated: true,
        isLoading: false,
        error: null,
        hasCheckedAuth: true,
      },
    },
  });
};

const renderWithProviders = (component: React.ReactElement) => {
  const store = createTestStore();

  return {
    store,
    ...render(
      <Provider store={store}>
        <BrowserRouter>{component}</BrowserRouter>
      </Provider>
    ),
  };
};

// Render and wait for the time entries fetch to settle
const renderPage = async () => {
  const result = renderWithProviders(<TimeEntries />);
  await waitFor(() => {
    expect(result.store.getState().timeEntries.loading).toBe(false);
  });
  return result;
};

describe("TimeEntries Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(projectsAPI.getProjects).mockResolvedValue([testProject]);
    vi.mocked(tasksAPI.getTasks).mockResolvedValue([]);
    respondWith({ entries: [], pagination: pagination(0) });
  });

  describe("Component Rendering", () => {
    it("shows the main interface when rendered", async () => {
      await renderPage();

      expect(
        screen.getByRole("heading", { name: "Time Entries" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("View and manage your time tracking records")
      ).toBeInTheDocument();
      expect(screen.getByTestId("timer-component")).toBeInTheDocument();
    });

    it("loads entries, projects and tasks on mount", async () => {
      await renderPage();

      expect(timeEntriesAPI.getTimeEntries).toHaveBeenCalledWith({});
      expect(projectsAPI.getProjects).toHaveBeenCalled();
      expect(tasksAPI.getTasks).toHaveBeenCalled();
    });
  });

  describe("API Response Format Handling", () => {
    it("handles backend response format mismatch gracefully", async () => {
      // An old-style bare array instead of { entries, pagination }
      respondWith([completedEntry()]);

      await renderPage();

      // Should not crash and show empty state
      expect(screen.getByText("Time Entries (0)")).toBeInTheDocument();
      expect(screen.getByText("No time entries found")).toBeInTheDocument();
    });

    it("handles empty API response gracefully", async () => {
      respondWith(null);

      await renderPage();

      expect(screen.getByText("Time Entries (0)")).toBeInTheDocument();
      expect(screen.getByText("No time entries found")).toBeInTheDocument();
    });
  });

  describe("Pagination Handling", () => {
    it("handles undefined pagination gracefully", async () => {
      respondWith({ entries: [completedEntry()] });

      await renderPage();

      // Falls back to empty pagination instead of crashing
      expect(screen.getByText("Working on feature X")).toBeInTheDocument();
      expect(screen.getByText("Time Entries (0)")).toBeInTheDocument();
      expect(screen.queryByText("Load More")).not.toBeInTheDocument();
    });

    it("displays correct total count when pagination is available", async () => {
      respondWith({ entries: [], pagination: pagination(42) });

      await renderPage();

      expect(screen.getByText("Time Entries (42)")).toBeInTheDocument();
    });
  });

  describe("Time Entries Display", () => {
    it("shows empty state when no entries are available", async () => {
      await renderPage();

      expect(screen.getByText("No time entries found")).toBeInTheDocument();
      expect(
        screen.getByText("Start tracking time to see your entries here.")
      ).toBeInTheDocument();
    });

    it("displays time entries when available", async () => {
      respondWith({ entries: [completedEntry()], pagination: pagination(1) });

      await renderPage();

      expect(screen.getByText("Working on feature X")).toBeInTheDocument();
      expect(screen.getByText("Test Project")).toBeInTheDocument();
      expect(screen.getByText("1h 0m")).toBeInTheDocument();
      expect(screen.getByText("Time Entries (1)")).toBeInTheDocument();
    });

    it("displays earnings from the entry's hourly rate snapshot", async () => {
      respondWith({
        entries: [
          // 1 hour at the $50/hour captured when the entry was created
          completedEntry({ hourlyRateSnapshot: 50 }),
          // No snapshot: earnings aren't recomputed from the project's rate
          completedEntry({ id: "2", description: "Unbilled", hourlyRateSnapshot: null }),
        ],
        pagination: pagination(2),
      });

      await renderPage();

      expect(screen.getByText(money(50, "USD"), exact)).toBeInTheDocument();
      expect(screen.getByText(money(0, "USD"), exact)).toBeInTheDocument();
    });

    it("shows delete button only for completed entries", async () => {
      respondWith({
        entries: [
          completedEntry({ description: "Completed entry" }),
          completedEntry({
            id: "2",
            description: "Running entry",
            startTime: "2023-01-01T12:00:00Z",
            endTime: undefined, // No end time - still running
            duration: 1800,
          }),
        ],
        pagination: pagination(2),
      });

      await renderPage();

      // Completed entries can be edited/deleted; running ones can only be stopped
      expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
      expect(screen.getByText("Running")).toBeInTheDocument();
    });
  });

  describe("Filtering", () => {
    it("shows and hides filters when toggle button is clicked", async () => {
      await renderPage();

      const toggleButton = screen.getByText("Show Filters");
      expect(screen.queryByText("Filters")).not.toBeInTheDocument();

      fireEvent.click(toggleButton);

      expect(screen.getByText("Filters")).toBeInTheDocument();
      expect(screen.getByText("Hide Filters")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "All Projects" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Test Project" })).toBeInTheDocument();

      fireEvent.click(screen.getByText("Hide Filters"));

      expect(screen.queryByText("Filters")).not.toBeInTheDocument();
    });

    it("refetches entries for the selected project when filters are applied", async () => {
      await renderPage();

      fireEvent.click(screen.getByText("Show Filters"));
      fireEvent.change(screen.getByDisplayValue("All Projects"), {
        target: { value: "1" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Apply Filters" }));

      await waitFor(() => {
        expect(timeEntriesAPI.getTimeEntries).toHaveBeenLastCalledWith({
          projectId: "1",
        });
      });
    });
  });

  describe("Loading States", () => {
    it("shows loading spinner when loading and no entries", () => {
      vi.mocked(timeEntriesAPI.getTimeEntries).mockReturnValue(
        new Promise(() => {}) // still loading
      );

      renderWithProviders(<TimeEntries />);

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    });

    it("shows load more button with entries and more pages", async () => {
      respondWith({
        entries: [completedEntry({ description: "Test entry" })],
        pagination: pagination(100, 2),
      });

      await renderPage();

      fireEvent.click(screen.getByText("Load More"));

      await waitFor(() => {
        expect(timeEntriesAPI.getTimeEntries).toHaveBeenLastCalledWith({ page: 2 });
      });
    });
  });

  describe("Error Handling", () => {
    it("displays error message when API call fails", async () => {
      vi.mocked(timeEntriesAPI.getTimeEntries).mockRejectedValue(
        new Error("Network Error")
      );

      await renderPage();

      expect(screen.getByText("Network Error")).toBeInTheDocument();
      expect(screen.getByText("No time entries found")).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("handles entry with no project gracefully", async () => {
      respondWith({
        entries: [
          completedEntry({
            description: "Entry without project",
            projectId: undefined,
            project: undefined,
          }),
        ],
        pagination: pagination(1),
      });

      await renderPage();

      expect(screen.getByText("No Project")).toBeInTheDocument();
      expect(screen.getByText("Entry without project")).toBeInTheDocument();
    });

    it("handles very long duration formatting correctly", async () => {
      respondWith({
        entries: [
          completedEntry({
            description: "Long entry",
            endTime: "2023-01-01T18:00:00Z",
            duration: 28800, // 8 hours
          }),
        ],
        pagination: pagination(1),
      });

      await renderPage();

      expect(screen.getByText("8h 0m")).toBeInTheDocument();
    });
  });
});
