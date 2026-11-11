import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "../../pages/Dashboard";
import { renderWithProviders, createMockStore } from "../../test/utils";
import {
  apiPath,
  getStartTimerCalls,
  resetMockData,
  server,
} from "../../test/mocks/server";
import { delay, http, HttpResponse } from "msw";

const projectSelect = () => screen.getByLabelText(/project \*/i);
const startButton = () => screen.getByRole("button", { name: /start timer/i });

// The dashboard and its start-a-timer form are still on screen
const expectDashboardUsable = () => {
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: /timers/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Start a timer" })).toBeInTheDocument();
  expect(projectSelect()).toBeInTheDocument();
  expect(startButton()).toBeInTheDocument();
};

type Store = ReturnType<typeof createMockStore>;

// Wait until the dashboard's mount fetches (and any project/task fetch) settle
const waitForIdle = (store: Store) =>
  waitFor(() => {
    const state = store.getState();
    expect(state.projects.loading).toBe(false);
    expect(state.timers.loading).toBe(false);
    expect(state.timeEntries.loading).toBe(false);
  });

const renderDashboard = async (store: Store = createMockStore()) => {
  const user = userEvent.setup();
  renderWithProviders(<Dashboard />, { store });
  await waitForIdle(store);
  return { user, store };
};

describe("Dashboard-Timer Integration", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("Blank Screen Prevention", () => {
    // Real bug: projectsSlice stores the non-array result as-is and
    // TimersBoard.tsx:67 calls projects.filter() on it, unmounting the dashboard.
    it("should prevent blank screen when API returns malformed project data", async () => {
      server.use(
        http.get(apiPath("/projects"), () => {
          return HttpResponse.json({ invalid: "response" });
        })
      );

      await renderDashboard();

      expectDashboardUsable();
    });

    // Real bug: same crash at TimersBoard.tsx:67 for { projects: null } (and
    // Timer's `projects = []` default doesn't cover null either).
    it("should prevent blank screen when API returns null projects", async () => {
      server.use(
        http.get(apiPath("/projects"), () => {
          return HttpResponse.json({ projects: null });
        })
      );

      await renderDashboard();

      expectDashboardUsable();
    });

    it("should prevent blank screen when tasks API returns malformed data", async () => {
      server.use(
        http.get(apiPath("/tasks"), () => {
          return HttpResponse.json({ invalid: "tasks response" });
        })
      );
      const { user, store } = await renderDashboard();

      // Select a project (this triggers the malformed tasks API)
      await user.selectOptions(projectSelect(), "project-1");
      await waitForIdle(store);

      expectDashboardUsable();
      expect(startButton()).toBeEnabled();
    });

    it("should prevent blank screen when tasks API returns null", async () => {
      server.use(
        http.get(apiPath("/tasks"), () => {
          return HttpResponse.json(null);
        })
      );
      const { user, store } = await renderDashboard();

      await user.selectOptions(projectSelect(), "project-1");
      await waitForIdle(store);

      expectDashboardUsable();
      expect(startButton()).toBeEnabled();
    });

    it("should handle complete API failure gracefully", async () => {
      server.use(
        http.get(apiPath("/projects"), () => HttpResponse.error()),
        http.get(apiPath("/tasks"), () => HttpResponse.error()),
        http.get(apiPath("/timers"), () => HttpResponse.error()),
        http.get(apiPath("/time-entries"), () => HttpResponse.error()),
        http.get(apiPath("/users/dashboard-earnings"), () => HttpResponse.error())
      );

      await renderDashboard();

      // Still rendered, with the projects already in the store
      expectDashboardUsable();
      expect(
        within(projectSelect()).getByRole("option", { name: "Test Project 1" })
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("region", { name: /timers/i })).getByRole("alert")
      ).toBeInTheDocument();
    });

    // Real bug: TimersBoard.tsx:67 (and Timer) call projects.filter() on
    // whatever the slice holds, so a non-array projects value blanks the page.
    it("should handle corrupted Redux state gracefully", async () => {
      const store = createMockStore();

      store.dispatch({
        type: "projects/fetchProjects/fulfilled",
        payload: "invalid data" as any,
      });

      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: { not: "an array" } as any,
      });

      renderWithProviders(<Dashboard />, { store });

      expectDashboardUsable();
    });

    it("should handle corrupted tasks state gracefully", async () => {
      const store = createMockStore();
      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: { not: "an array" } as any,
      });

      const { user } = await renderDashboard(store);
      await user.selectOptions(projectSelect(), "project-1");

      expectDashboardUsable();
      expect(startButton()).toBeEnabled();
    });

    it("should maintain functionality during rapid project switching", async () => {
      const { user, store } = await renderDashboard();

      // Rapidly switch between projects multiple times
      for (let i = 0; i < 5; i++) {
        await user.selectOptions(projectSelect(), "project-1");
        await user.selectOptions(projectSelect(), "project-2");
        await user.selectOptions(projectSelect(), "");
        await user.selectOptions(projectSelect(), "project-1");
      }
      await waitForIdle(store);

      expectDashboardUsable();
      expect(projectSelect()).toHaveValue("project-1");
      expect(startButton()).toBeEnabled();
    });

    it("should handle timer operations with corrupted state", async () => {
      const { user, store } = await renderDashboard();

      await user.selectOptions(projectSelect(), "project-1");
      await user.click(startButton());
      await waitFor(() => {
        expect(store.getState().timer.runningEntries).toHaveLength(1);
      });

      // Corrupt the state while a timer is running
      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: null as any,
      });

      // Dashboard should still be visible and another timer can start
      expectDashboardUsable();
      await user.click(startButton());
      await waitFor(() => {
        expect(store.getState().timer.runningEntries).toHaveLength(2);
      });
      expect(getStartTimerCalls()).toEqual([
        { projectId: "project-1" },
        { projectId: "project-1" },
      ]);
    });

    it("should handle network timeouts gracefully", async () => {
      server.use(
        http.get(apiPath("/tasks"), async () => {
          await delay(200);
          return HttpResponse.json({ tasks: [] });
        })
      );
      const { user, store } = await renderDashboard();

      // Select project (triggers slow API call)
      await user.selectOptions(projectSelect(), "project-1");

      // Dashboard should remain responsive during API call
      expectDashboardUsable();
      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getByText("This Week")).toBeInTheDocument();
      expect(startButton()).toBeEnabled();

      await waitForIdle(store);
      expectDashboardUsable();
    });
  });

  describe("Error Recovery", () => {
    it("should recover from API errors when API becomes available again", async () => {
      // Start with API error
      server.use(
        http.get(apiPath("/tasks"), () => {
          return HttpResponse.error();
        })
      );
      const { user, store } = await renderDashboard();

      // Select project (API fails)
      await user.selectOptions(projectSelect(), "project-1");
      await waitFor(() => {
        expect(store.getState().projects.error).toBeTruthy();
      });
      expectDashboardUsable();

      // Fix the API
      server.use(
        http.get(apiPath("/tasks"), () => {
          return HttpResponse.json({
            tasks: [
              {
                id: "task-1",
                name: "Recovered Task",
                projectId: "project-1",
                isCompleted: false,
                createdAt: "2024-01-01T00:00:00Z",
                updatedAt: "2024-01-01T00:00:00Z",
              },
            ],
          });
        })
      );

      // Select project again (should work now)
      await user.selectOptions(projectSelect(), "project-2");
      await user.selectOptions(projectSelect(), "project-1");

      // Should eventually show tasks when API recovers
      const taskSelect = await screen.findByLabelText(/task \(optional\)/i);
      await waitFor(() => {
        expect(
          within(taskSelect).getByRole("option", { name: "Recovered Task" })
        ).toBeInTheDocument();
      });
    });
  });
});
