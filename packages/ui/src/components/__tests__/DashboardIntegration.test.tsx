import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "../../pages/Dashboard";
import { renderWithProviders, createMockStore } from "../../test/utils";
import { server, resetMockData } from "../../test/mocks/server";
import { http, HttpResponse } from "msw";

describe("Dashboard-Timer Integration", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("Blank Screen Prevention", () => {
    it("should prevent blank screen when API returns malformed project data", async () => {
      // Mock malformed projects response
      server.use(
        http.get("http://localhost:3000/projects", () => {
          return HttpResponse.json({ invalid: "response" });
        })
      );

      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Dashboard should still render despite malformed API response
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should prevent blank screen when API returns null projects", async () => {
      // Mock null projects response
      server.use(
        http.get("http://localhost:3000/projects", () => {
          return HttpResponse.json({ projects: null });
        })
      );

      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Dashboard should still render
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should prevent blank screen when tasks API returns malformed data", async () => {
      // Mock malformed tasks response
      server.use(
        http.get("http://localhost:3000/tasks", () => {
          return HttpResponse.json({ invalid: "tasks response" });
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select a project (this triggers the malformed tasks API)
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Dashboard should remain visible
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();

      // Timer should still be functional
      expect(
        screen.getByRole("button", { name: /start timer/i })
      ).toBeInTheDocument();
    });

    it("should prevent blank screen when tasks API returns null", async () => {
      // Mock null tasks response
      server.use(
        http.get("http://localhost:3000/tasks", () => {
          return HttpResponse.json(null);
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select a project
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Dashboard should remain visible
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should handle complete API failure gracefully", async () => {
      // Mock complete API failure
      server.use(
        http.get("http://localhost:3000/projects", () => {
          return HttpResponse.error();
        }),
        http.get("http://localhost:3000/tasks", () => {
          return HttpResponse.error();
        })
      );

      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Dashboard should still render with cached data
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should handle corrupted Redux state gracefully", async () => {
      const store = createMockStore();

      // Corrupt the state
      store.dispatch({
        type: "projects/fetchProjects/fulfilled",
        payload: "invalid data" as any,
      });

      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: { not: "an array" } as any,
      });

      renderWithProviders(<Dashboard />, { store });

      // Dashboard should still render
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should maintain functionality during rapid project switching", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);

      // Rapidly switch between projects multiple times
      for (let i = 0; i < 5; i++) {
        await user.selectOptions(projectSelect, "project-1");
        await user.selectOptions(projectSelect, "project-2");
        await user.selectOptions(projectSelect, "");
        await user.selectOptions(projectSelect, "project-1");
      }

      // Dashboard should remain stable
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /start timer/i })
      ).toBeInTheDocument();
    });

    it("should handle timer operations with corrupted state", async () => {
      const user = userEvent.setup();
      const store = createMockStore();

      // Start with good state
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

      // Wait for timer to start
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /stop timer/i })
        ).toBeInTheDocument();
      });

      // Corrupt the state while timer is running
      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: null as any,
      });

      // Dashboard should still be visible and timer should still work
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /stop timer/i })
      ).toBeInTheDocument();

      // Should be able to stop timer
      const stopButton = screen.getByRole("button", { name: /stop timer/i });
      await user.click(stopButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /start timer/i })
        ).toBeInTheDocument();
      });
    });

    it("should handle network timeouts gracefully", async () => {
      // Mock slow/timeout responses
      server.use(
        http.get("http://localhost:3000/tasks", async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return HttpResponse.json([]);
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select project (triggers slow API call)
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Dashboard should remain responsive during API call
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Current Timer")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();

      // Should be able to interact with other elements
      expect(screen.getByText("Today's Total")).toBeInTheDocument();
      expect(screen.getByText("This Week")).toBeInTheDocument();
    });
  });

  describe("Error Recovery", () => {
    it("should recover from API errors when API becomes available again", async () => {
      // Start with API error
      server.use(
        http.get("http://localhost:3000/tasks", () => {
          return HttpResponse.error();
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Dashboard />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select project (API fails)
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Dashboard should still work
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();

      // Fix the API
      server.use(
        http.get("http://localhost:3000/tasks", () => {
          return HttpResponse.json([
            {
              id: "task-1",
              name: "Recovered Task",
              projectId: "project-1",
              isActive: true,
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ]);
        })
      );

      // Select project again (should work now)
      await user.selectOptions(projectSelect, "project-2");
      await user.selectOptions(projectSelect, "project-1");

      // Should eventually show tasks when API recovers
      await waitFor(
        () => {
          expect(
            screen.getByLabelText(/task \(optional\)/i)
          ).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });
});
