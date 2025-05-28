import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "../../pages/Dashboard";
import { renderWithProviders, createMockStore } from "../../test/utils";
import { server, resetMockData } from "../../test/mocks/server";
import { http, HttpResponse } from "msw";

describe("Dashboard Component", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("Initial Render", () => {
    it("should render dashboard with all sections", async () => {
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(
        screen.getByText("Welcome to your time tracking dashboard")
      ).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("Today's Total")).toBeInTheDocument();
      expect(screen.getByText("This Week")).toBeInTheDocument();
      expect(screen.getByText("Recent Projects")).toBeInTheDocument();
      expect(screen.getByText("Recent Time Entries")).toBeInTheDocument();
    });

    it("should render timer component within dashboard", async () => {
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      await waitFor(() => {
        expect(screen.getByText("00:00:00")).toBeInTheDocument();
        expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();
      });
    });
  });

  describe("Project Selection on Dashboard", () => {
    it("should handle project selection without causing blank screen", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Verify dashboard content is visible
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();

      // Select a project
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Verify dashboard content is still visible after project selection
      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
        expect(screen.getByText("Current Timer")).toBeInTheDocument();
        expect(screen.getByText("Today's Total")).toBeInTheDocument();
      });

      // Verify task selector appears
      await waitFor(() => {
        expect(screen.getByLabelText(/task \(optional\)/i)).toBeInTheDocument();
      });
    });

    it("should handle project selection with API errors gracefully", async () => {
      // Mock API error for tasks
      server.use(
        http.get("http://localhost:3000/api/tasks", () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();

      // Clear tasks from store to simulate fresh state
      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: [],
      });

      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select a project
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Verify dashboard content is still visible even with API error
      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
        expect(screen.getByText("Current Timer")).toBeInTheDocument();
      });

      // Task selector should not appear due to error and empty tasks
      expect(
        screen.queryByLabelText(/task \(optional\)/i)
      ).not.toBeInTheDocument();
    });

    it("should handle rapid project selection changes", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);

      // Rapidly change project selection
      await user.selectOptions(projectSelect, "project-1");
      await user.selectOptions(projectSelect, "project-2");
      await user.selectOptions(projectSelect, "project-1");

      // Verify dashboard remains stable
      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
        expect(screen.getByText("Current Timer")).toBeInTheDocument();
      });
    });

    it("should handle project selection when projects API fails", async () => {
      // Mock API error for projects
      server.use(
        http.get("http://localhost:3000/api/projects", () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        })
      );

      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Dashboard should still render even if projects fail to load
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("Today's Total")).toBeInTheDocument();
    });

    it("should maintain dashboard layout during timer operations", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select project and start timer
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      // Verify dashboard layout is maintained during timer start
      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
        expect(screen.getByText("Current Timer")).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /stop timer/i })
        ).toBeInTheDocument();
      });

      // Stop timer
      const stopButton = screen.getByRole("button", { name: /stop timer/i });
      await user.click(stopButton);

      // Verify dashboard layout is maintained after timer stop
      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
        expect(screen.getByText("Current Timer")).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /start timer/i })
        ).toBeInTheDocument();
      });
    });
  });

  describe("Error Boundary Testing", () => {
    it("should handle component errors gracefully", async () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Create a store with invalid state to trigger potential errors
      const store = createMockStore();

      // Dispatch an action that might cause issues
      store.dispatch({
        type: "projects/fetchProjects/rejected",
        error: { message: "Network error" },
      });

      renderWithProviders(<Dashboard />, { store });

      // Dashboard should still render basic structure
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(
        screen.getByText("Welcome to your time tracking dashboard")
      ).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe("State Management Integration", () => {
    it("should handle empty projects state", async () => {
      const store = createMockStore();

      // Clear projects from store
      store.dispatch({
        type: "projects/fetchProjects/fulfilled",
        payload: [],
      });

      renderWithProviders(<Dashboard />, { store });

      // Dashboard should render with empty state
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Select a project...")).toBeInTheDocument();
    });

    it("should handle loading states properly", async () => {
      const store = createMockStore();

      // Set loading state
      store.dispatch({
        type: "projects/fetchProjects/pending",
      });

      renderWithProviders(<Dashboard />, { store });

      // Dashboard should render during loading
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
    });
  });
});
