import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timer from "../Timer";
import { renderWithProviders, createMockStore } from "../../test/utils";
import { server, resetMockData } from "../../test/mocks/server";
import { http, HttpResponse } from "msw";

describe("Timer Component", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("Initial State", () => {
    it("should render timer display with 00:00:00", async () => {
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should show project selector when timer is not running", async () => {
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();
        expect(screen.getByText("Select a project...")).toBeInTheDocument();
      });
    });

    it("should show start timer button when not running", async () => {
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      expect(
        screen.getByRole("button", { name: /start timer/i })
      ).toBeInTheDocument();
    });

    it("should show project requirement notice when no project selected", async () => {
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      expect(screen.getByText("Project Required")).toBeInTheDocument();
      expect(
        screen.getByText(/all time tracking must be associated with a project/i)
      ).toBeInTheDocument();
    });
  });

  describe("Project Selection", () => {
    it("should populate project dropdown with available projects", async () => {
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
        expect(screen.getByText("Test Project 2")).toBeInTheDocument();
      });
    });

    it("should show task selector when project is selected", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      await waitFor(() => {
        expect(screen.getByLabelText(/task \(optional\)/i)).toBeInTheDocument();
        expect(screen.getByText("Test Task 1")).toBeInTheDocument();
      });
    });

    it("should reset task selection when project changes", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);

      await user.selectOptions(projectSelect, "project-1");
      await waitFor(() => {
        expect(screen.getByLabelText(/task \(optional\)/i)).toBeInTheDocument();
      });

      const taskSelect = screen.getByLabelText(/task \(optional\)/i);
      await user.selectOptions(taskSelect, "task-1");

      await user.selectOptions(projectSelect, "project-2");

      await waitFor(() => {
        const taskSelectAfter = screen.queryByLabelText(/task \(optional\)/i);
        expect(taskSelectAfter).not.toBeInTheDocument();
      });
    });
  });

  describe("Timer Start Functionality", () => {
    it("should prevent starting timer without project selection", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should start timer successfully with project selected", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /stop timer/i })
        ).toBeInTheDocument();
      });
    });

    it("should start timer with project and task selected", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      await waitFor(() => {
        expect(screen.getByLabelText(/task \(optional\)/i)).toBeInTheDocument();
      });

      const taskSelect = screen.getByLabelText(/task \(optional\)/i);
      await user.selectOptions(taskSelect, "task-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /stop timer/i })
        ).toBeInTheDocument();
      });
    });

    it("should include description when starting timer", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      const descriptionInput = screen.getByPlaceholderText(
        /what are you working on/i
      );
      await user.type(descriptionInput, "Working on feature X");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /stop timer/i })
        ).toBeInTheDocument();
      });
    });
  });

  describe("Timer Running State", () => {
    it("should hide project selector when timer is running", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.queryByLabelText(/project \*/i)).not.toBeInTheDocument();
      });
    });

    it("should show project and task name when timer is running", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      await waitFor(() => {
        expect(screen.getByLabelText(/task \(optional\)/i)).toBeInTheDocument();
      });

      const taskSelect = screen.getByLabelText(/task \(optional\)/i);
      await user.selectOptions(taskSelect, "task-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
        expect(screen.getByText("Test Task 1")).toBeInTheDocument();
      });
    });

    it("should show description when timer is running", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      const descriptionInput = screen.getByPlaceholderText(
        /what are you working on/i
      );
      await user.type(descriptionInput, "Working on feature X");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText("Working on feature X")).toBeInTheDocument();
      });
    });
  });

  describe("Timer Stop Functionality", () => {
    it("should stop timer successfully", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByRole("combobox", {
        name: /project \*/i,
      });
      await user.selectOptions(projectSelect, "project-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /stop timer/i })
        ).toBeInTheDocument();
      });

      const stopButton = screen.getByRole("button", { name: /stop timer/i });
      await user.click(stopButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /start timer/i })
        ).toBeInTheDocument();
      });
    });

    it("should show project selector again after stopping timer", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByRole("combobox", {
        name: /project \*/i,
      });
      await user.selectOptions(projectSelect, "project-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /stop timer/i })
        ).toBeInTheDocument();
      });

      const stopButton = screen.getByRole("button", { name: /stop timer/i });
      await user.click(stopButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();
      });
    });

    it("should reset timer display after stopping", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByRole("combobox", {
        name: /project \*/i,
      });
      await user.selectOptions(projectSelect, "project-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /stop timer/i })
        ).toBeInTheDocument();
      });

      const stopButton = screen.getByRole("button", { name: /stop timer/i });
      await user.click(stopButton);

      await waitFor(() => {
        expect(screen.getByText("00:00:00")).toBeInTheDocument();
      });
    });
  });

  describe("Error Handling", () => {
    it("should display error when API call fails", async () => {
      server.use(
        http.post("http://localhost:3000/api/time-entries/start", () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const projectSelect = screen.getByRole("combobox", {
        name: /project \*/i,
      });
      await user.selectOptions(projectSelect, "project-1");

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to start timer/i)).toBeInTheDocument();
      });
    });

    it("should handle missing project error", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      const startButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(startButton);

      expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();
    });
  });

  describe("Blank Screen Prevention", () => {
    it("should not cause blank screen when project selection triggers multiple API calls", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Verify timer is visible
      expect(screen.getByText("00:00:00")).toBeInTheDocument();

      // Select a project (this triggers fetchTasks)
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Verify timer remains visible during and after project selection
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
      expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();

      // Verify task selector appears
      await waitFor(() => {
        expect(screen.getByLabelText(/task \(optional\)/i)).toBeInTheDocument();
      });

      // Timer should still be visible
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should handle concurrent project and task API calls without blank screen", async () => {
      const user = userEvent.setup();
      const store = createMockStore();

      // Clear tasks to force API call
      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: [],
      });

      renderWithProviders(<Timer />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Rapidly select different projects to trigger multiple API calls
      const projectSelect = screen.getByLabelText(/project \*/i);

      await user.selectOptions(projectSelect, "project-1");
      await user.selectOptions(projectSelect, "project-2");
      await user.selectOptions(projectSelect, "project-1");

      // Timer should remain visible throughout
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
      expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();
    });

    it("should handle API timeout scenarios without blank screen", async () => {
      // Mock slow API response
      server.use(
        http.get("http://localhost:3000/api/tasks", async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json([]);
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select a project
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Timer should remain visible during API call
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
      expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();

      // Wait for API call to complete
      await waitFor(() => {
        // Should not have task selector since API returned empty array
        expect(
          screen.queryByLabelText(/task \(optional\)/i)
        ).not.toBeInTheDocument();
      });

      // Timer should still be visible
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
    });

    it("should handle network errors during project selection gracefully", async () => {
      // Mock network error
      server.use(
        http.get("http://localhost:3000/api/tasks", () => {
          return HttpResponse.error();
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select a project
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Timer should remain visible even with network error
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
      expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();

      // Should not crash or show blank screen
      expect(
        screen.getByRole("button", { name: /start timer/i })
      ).toBeInTheDocument();
    });

    it("should handle malformed API responses without blank screen", async () => {
      // Mock malformed response
      server.use(
        http.get("http://localhost:3000/api/tasks", () => {
          return HttpResponse.json({ invalid: "response" });
        })
      );

      const user = userEvent.setup();
      const store = createMockStore();
      renderWithProviders(<Timer />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select a project
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Timer should remain visible
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
      expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();
    });

    it("should handle state corruption scenarios", async () => {
      const user = userEvent.setup();
      const store = createMockStore();

      // Simulate corrupted state
      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: null as any,
      });

      renderWithProviders(<Timer />, { store });

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      });

      // Select a project
      const projectSelect = screen.getByLabelText(/project \*/i);
      await user.selectOptions(projectSelect, "project-1");

      // Timer should remain visible despite corrupted state
      expect(screen.getByText("00:00:00")).toBeInTheDocument();
      expect(screen.getByLabelText(/project \*/i)).toBeInTheDocument();
    });
  });
});
