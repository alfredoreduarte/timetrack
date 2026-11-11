import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "../../pages/Dashboard";
import { renderWithProviders, createMockStore } from "../../test/utils";
import {
  apiPath,
  getStartTimerCalls,
  makeMockTimer,
  resetMockData,
  server,
  setMockEarnings,
  setMockTimeEntries,
  setMockTimers,
} from "../../test/mocks/server";
import { http, HttpResponse } from "msw";

const projectSelect = () => screen.getByLabelText(/project \*/i);
const timersBoard = () =>
  screen.getByRole("region", { name: /timers/i });
const recentEntries = () =>
  screen.getByRole("heading", { name: "Recent Time Entries" }).closest(".card") as HTMLElement;

// The dashboard's core sections, all present no matter what the data looks like
const expectDashboardLayout = () => {
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(timersBoard()).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Start a timer" })).toBeInTheDocument();
  expect(screen.getByText("Today")).toBeInTheDocument();
  expect(screen.getByText("This Week")).toBeInTheDocument();
};

const renderDashboard = async (store = createMockStore()) => {
  const user = userEvent.setup();
  renderWithProviders(<Dashboard />, { store });
  // Initial fetches settled: projects listed, timers board loaded
  await waitFor(() => {
    expect(
      within(projectSelect()).getByRole("option", { name: "Test Project 1" })
    ).toBeInTheDocument();
    expect(store.getState().timers.loaded).toBe(true);
  });
  return { user, store };
};

describe("Dashboard Component", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("Initial Render", () => {
    it("should render dashboard with all sections", async () => {
      await renderDashboard();

      expectDashboardLayout();
      expect(
        screen.getByText("Track your time and monitor earnings")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Recent Time Entries" })
      ).toBeInTheDocument();
    });

    it("should render the start-a-timer form within dashboard", async () => {
      await renderDashboard();

      expect(projectSelect()).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /start timer/i })).toBeDisabled();
    });

    it("should show today's and this week's earnings from the API", async () => {
      setMockEarnings({
        today: { earnings: 125.5, duration: 9000 },
        thisWeek: { earnings: 400, duration: 28800 },
      });

      await renderDashboard();

      expect(await screen.findByText("$125.50")).toBeInTheDocument();
      expect(screen.getByText("$400.00")).toBeInTheDocument();
      expect(screen.queryByText("Earning Now")).not.toBeInTheDocument();
    });
  });

  describe("Timers Board", () => {
    it("should show an empty state when no timer is active", async () => {
      await renderDashboard();

      expect(
        within(timersBoard()).getByText(/nothing running/i)
      ).toBeInTheDocument();
    });

    it("should list running and paused timers from the API", async () => {
      setMockTimers([
        makeMockTimer({ id: "timer-1", description: "Fix login bug", trackedSeconds: 65 }),
        makeMockTimer({
          id: "timer-2",
          description: "Write docs",
          status: "paused",
          pauseReason: "manual",
          projectId: null,
          project: null,
        }),
      ]);

      await renderDashboard();
      const board = within(timersBoard());

      expect(board.getByText("Fix login bug")).toBeInTheDocument();
      expect(board.getByText("Write docs")).toBeInTheDocument();
      expect(board.getByText("1 running · 1 paused")).toBeInTheDocument();
      expect(board.getByText("Paused")).toBeInTheDocument();
      // The unassigned timer offers a project picker
      expect(board.getByLabelText("Assign a project")).toBeInTheDocument();
      expect(board.getByRole("button", { name: "Pause Fix login bug" })).toBeInTheDocument();
      expect(board.getByRole("button", { name: "Resume Write docs" })).toBeInTheDocument();
    });

    it("should pause a running timer from the board", async () => {
      setMockTimers([makeMockTimer({ id: "timer-1", description: "Fix login bug" })]);
      const { user } = await renderDashboard();

      await user.click(screen.getByRole("button", { name: "Pause Fix login bug" }));

      expect(
        await screen.findByRole("button", { name: "Resume Fix login bug" })
      ).toBeInTheDocument();
      expect(within(timersBoard()).getByText("0 running · 1 paused")).toBeInTheDocument();
    });

    it("should remove a timer from the board once it is stopped", async () => {
      setMockTimers([makeMockTimer({ id: "timer-1", description: "Fix login bug" })]);
      const { user } = await renderDashboard();

      await user.click(screen.getByRole("button", { name: "Stop Fix login bug" }));

      await waitFor(() => {
        expect(screen.queryByText("Fix login bug")).not.toBeInTheDocument();
      });
      expect(within(timersBoard()).getByText(/nothing running/i)).toBeInTheDocument();
    });

    it("should show an error when a board action fails", async () => {
      setMockTimers([makeMockTimer({ id: "timer-1", description: "Fix login bug" })]);
      server.use(
        http.post(apiPath("/timers/:id/stop"), () =>
          HttpResponse.json({ error: "Timer is already stopped" }, { status: 400 })
        )
      );
      const { user } = await renderDashboard();

      await user.click(screen.getByRole("button", { name: "Stop Fix login bug" }));

      expect(
        await within(timersBoard()).findByRole("alert")
      ).toHaveTextContent("Timer is already stopped");
      expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    });
  });

  describe("Recent Time Entries", () => {
    it("should show an empty state when there are no entries", async () => {
      await renderDashboard();

      expect(
        within(recentEntries()).getByText(/no time entries yet/i)
      ).toBeInTheDocument();
    });

    it("should list recent entries with duration and earnings", async () => {
      setMockTimeEntries([
        {
          id: "entry-1",
          description: "Wrote tests",
          startTime: "2024-01-01T10:00:00Z",
          endTime: "2024-01-01T11:00:00Z",
          duration: 3600,
          hourlyRateSnapshot: 50,
          projectId: "project-1",
          taskId: null,
          userId: "user-1",
        },
      ]);

      await renderDashboard();
      const section = within(recentEntries());

      expect(await section.findByText("Wrote tests")).toBeInTheDocument();
      expect(section.getByText("Test Project 1")).toBeInTheDocument();
      expect(section.getByText("1h 0m")).toBeInTheDocument();
      expect(section.getByText("$50.00")).toBeInTheDocument();
    });
  });

  describe("Project Selection on Dashboard", () => {
    it("should handle project selection without causing blank screen", async () => {
      const { user } = await renderDashboard();

      await user.selectOptions(projectSelect(), "project-1");

      await waitFor(() => {
        expect(screen.getByLabelText(/task \(optional\)/i)).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Test Task 1" })).toBeInTheDocument();
      });
      expectDashboardLayout();
    });

    it("should handle project selection with API errors gracefully", async () => {
      server.use(
        http.get(apiPath("/tasks"), () =>
          HttpResponse.json({ error: "Server error" }, { status: 500 })
        )
      );
      const store = createMockStore();
      // Clear tasks from store to simulate fresh state
      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: [],
      });
      const { user } = await renderDashboard(store);

      await user.selectOptions(projectSelect(), "project-1");
      await waitFor(() => {
        expect(store.getState().projects.error).toBeTruthy();
      });

      expectDashboardLayout();
      // No tasks could be loaded, so only the "No task" choice is offered
      const taskSelect = screen.getByLabelText(/task \(optional\)/i);
      expect(within(taskSelect).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "No task",
      ]);
    });

    it("should handle rapid project selection changes", async () => {
      const { user } = await renderDashboard();

      await user.selectOptions(projectSelect(), "project-1");
      await user.selectOptions(projectSelect(), "project-2");
      await user.selectOptions(projectSelect(), "project-1");

      expect(projectSelect()).toHaveValue("project-1");
      expectDashboardLayout();
    });

    it("should keep the loaded projects when the projects API fails", async () => {
      server.use(
        http.get(apiPath("/projects"), () =>
          HttpResponse.json({ error: "Server error" }, { status: 500 })
        )
      );
      const store = createMockStore();

      renderWithProviders(<Dashboard />, { store });
      await waitFor(() => {
        expect(store.getState().projects.error).toBeTruthy();
      });

      expectDashboardLayout();
      expect(
        within(projectSelect()).getByRole("option", { name: "Test Project 1" })
      ).toBeInTheDocument();
    });

    it("should maintain dashboard layout when starting a timer", async () => {
      const { user, store } = await renderDashboard();

      await user.selectOptions(projectSelect(), "project-1");
      await user.click(screen.getByRole("button", { name: /start timer/i }));

      await waitFor(() => {
        expect(store.getState().timer.isRunning).toBe(true);
      });
      expect(getStartTimerCalls()).toEqual([{ projectId: "project-1" }]);
      expectDashboardLayout();
      // Ready to start another one
      expect(screen.getByRole("button", { name: /start timer/i })).toBeEnabled();
    });
  });

  describe("Error Boundary Testing", () => {
    it("should handle component errors gracefully", async () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const store = createMockStore();
      store.dispatch({
        type: "projects/fetchProjects/rejected",
        error: { message: "Network error" },
      });

      await renderDashboard(store);

      expectDashboardLayout();
      expect(
        screen.getByText("Track your time and monitor earnings")
      ).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe("State Management Integration", () => {
    it("should handle empty projects state", async () => {
      server.use(
        http.get(apiPath("/projects"), () => HttpResponse.json({ projects: [] }))
      );
      const store = createMockStore();
      store.dispatch({
        type: "projects/fetchProjects/fulfilled",
        payload: [],
      });

      renderWithProviders(<Dashboard />, { store });
      await waitFor(() => {
        expect(store.getState().timers.loaded).toBe(true);
        expect(store.getState().projects.loading).toBe(false);
      });

      expectDashboardLayout();
      expect(
        within(projectSelect()).getAllByRole("option").map((o) => o.textContent)
      ).toEqual(["Select a project"]);
    });

    it("should handle loading states properly", async () => {
      const store = createMockStore();
      store.dispatch({
        type: "projects/fetchProjects/pending",
      });

      renderWithProviders(<Dashboard />, { store });

      expectDashboardLayout();
      await waitFor(() => {
        expect(store.getState().projects.loading).toBe(false);
      });
    });
  });
});
