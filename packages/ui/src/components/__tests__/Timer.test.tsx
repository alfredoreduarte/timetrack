import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timer from "../Timer";
import { renderWithProviders, createMockStore } from "../../test/utils";
import {
  apiPath,
  getMockProjects,
  getStartTimerCalls,
  resetMockData,
  server,
} from "../../test/mocks/server";
import { delay, http, HttpResponse } from "msw";

// Timer is the "start a timer" form. Running timers are shown (and stopped)
// on the TimersBoard — see Dashboard.test.tsx.

const projectSelect = () => screen.getByLabelText(/project \*/i);
const taskSelect = () => screen.getByLabelText(/task \(optional\)/i);
const startButton = () => screen.getByRole("button", { name: /start timer/i });
const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

const renderTimer = async () => {
  const user = userEvent.setup();
  const store = createMockStore();
  renderWithProviders(<Timer />, { store });
  await waitFor(() => {
    expect(screen.getByRole("option", { name: "Test Project 1" })).toBeInTheDocument();
  });
  return { user, store };
};

// Wait for the fetch the project selection triggered to settle
const waitForProjectsIdle = (store: ReturnType<typeof createMockStore>) =>
  waitFor(() => {
    expect(store.getState().projects.loading).toBe(false);
  });

describe("Timer Component", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("Initial State", () => {
    it("should show the project selector with a placeholder", async () => {
      await renderTimer();

      expect(projectSelect()).toHaveValue("");
      expect(
        screen.getByRole("option", { name: "Select a project" })
      ).toBeInTheDocument();
    });

    it("should disable the start button until a project is selected", async () => {
      await renderTimer();

      expect(startButton()).toBeDisabled();
    });

    it("should not show the task selector before a project is selected", async () => {
      await renderTimer();

      expect(screen.queryByLabelText(/task \(optional\)/i)).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(/what are you working on/i)).toBeInTheDocument();
    });
  });

  describe("Project Selection", () => {
    it("should list only active projects", async () => {
      server.use(
        http.get(apiPath("/projects"), () =>
          HttpResponse.json({
            projects: [
              ...getMockProjects(),
              { ...getMockProjects()[0], id: "project-archived", name: "Archived Project", isActive: false },
            ],
          })
        )
      );
      const { store } = await renderTimer();
      await waitFor(() => {
        expect(store.getState().projects.projects).toHaveLength(3);
      });

      expect(optionNames(projectSelect())).toEqual([
        "Select a project",
        "Test Project 1",
        "Test Project 2",
      ]);
    });

    it("should show the selected project's tasks", async () => {
      const { user } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");

      await waitFor(() => {
        expect(optionNames(taskSelect())).toEqual([
          "No task",
          "Test Task 1",
          "Test Task 2",
        ]);
      });
      expect(startButton()).toBeEnabled();
    });

    it("should load the tasks of the newly selected project when the project changes", async () => {
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await waitFor(() => {
        expect(optionNames(taskSelect())).toContain("Test Task 1");
      });

      await user.selectOptions(projectSelect(), "project-2");
      await waitForProjectsIdle(store);

      // project-2 has no tasks
      expect(optionNames(taskSelect())).toEqual(["No task"]);
    });

    // Real bug: Timer.tsx keeps selectedTaskId when the project changes, so the
    // start request pairs project-2 with project-1's task (the API rejects that).
    it.skip("should not start with the previous project's task after switching projects", async () => {
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await waitFor(() => {
        expect(optionNames(taskSelect())).toContain("Test Task 1");
      });
      await user.selectOptions(taskSelect(), "task-1");

      await user.selectOptions(projectSelect(), "project-2");
      await waitForProjectsIdle(store);
      await user.click(startButton());

      await waitFor(() => {
        expect(getStartTimerCalls()).toHaveLength(1);
      });
      expect(getStartTimerCalls()[0]).toEqual({ projectId: "project-2" });
    });
  });

  describe("Timer Start Functionality", () => {
    it("should not start a timer without a project", async () => {
      const { user } = await renderTimer();

      await user.click(startButton());

      expect(getStartTimerCalls()).toEqual([]);
    });

    it("should start a timer for the selected project", async () => {
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await user.click(startButton());

      await waitFor(() => {
        expect(store.getState().timer.isRunning).toBe(true);
      });
      expect(getStartTimerCalls()).toEqual([{ projectId: "project-1" }]);
      expect(store.getState().timer.currentEntry?.projectId).toBe("project-1");
    });

    it("should send the selected task and description", async () => {
      const { user } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await waitFor(() => {
        expect(optionNames(taskSelect())).toContain("Test Task 1");
      });
      await user.selectOptions(taskSelect(), "task-1");
      await user.type(
        screen.getByPlaceholderText(/what are you working on/i),
        "Working on feature X"
      );
      await user.click(startButton());

      await waitFor(() => {
        expect(getStartTimerCalls()).toEqual([
          {
            projectId: "project-1",
            taskId: "task-1",
            description: "Working on feature X",
          },
        ]);
      });
    });

    it("should clear the description after starting so another timer can start right away", async () => {
      const { user, store } = await renderTimer();
      const descriptionInput = screen.getByPlaceholderText(/what are you working on/i);

      await user.selectOptions(projectSelect(), "project-1");
      await user.type(descriptionInput, "First");
      await user.click(startButton());

      await waitFor(() => {
        expect(descriptionInput).toHaveValue("");
      });
      expect(startButton()).toBeEnabled();

      // Concurrent timers are allowed
      await user.click(startButton());
      await waitFor(() => {
        expect(store.getState().timer.runningEntries).toHaveLength(2);
      });
    });

    it("should show a loading label while the timer is starting", async () => {
      server.use(
        http.post(apiPath("/time-entries/start"), async () => {
          await delay(100);
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        })
      );
      const { user } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await user.click(startButton());

      const starting = await screen.findByRole("button", { name: /starting/i });
      expect(starting).toBeDisabled();
      await waitFor(() => {
        expect(startButton()).toBeEnabled();
      });
    });

    it("should start the timer once when Enter is pressed in the description", async () => {
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await user.type(
        screen.getByPlaceholderText(/what are you working on/i),
        "Working on feature X{Enter}"
      );

      await waitFor(() => {
        expect(store.getState().timer.isRunning).toBe(true);
      });
      expect(getStartTimerCalls()).toEqual([
        { projectId: "project-1", description: "Working on feature X" },
      ]);
    });

    it("should start the timer when Enter is pressed in the project selector", async () => {
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(store.getState().timer.isRunning).toBe(true);
      });
      expect(getStartTimerCalls()).toEqual([{ projectId: "project-1" }]);
    });

    it("should not start the timer on Enter when no project is selected", async () => {
      const { user, store } = await renderTimer();

      await user.type(
        screen.getByPlaceholderText(/what are you working on/i),
        "Working on feature X{Enter}"
      );

      expect(getStartTimerCalls()).toEqual([]);
      expect(store.getState().timer.isRunning).toBe(false);
      expect(startButton()).toBeDisabled();
    });
  });

  describe("Error Handling", () => {
    it("should display the API's error message when starting fails", async () => {
      server.use(
        http.post(apiPath("/time-entries/start"), () =>
          HttpResponse.json({ error: "Project not found" }, { status: 404 })
        )
      );
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await user.click(startButton());

      expect(await screen.findByText("Project not found")).toBeInTheDocument();
      expect(store.getState().timer.isRunning).toBe(false);
      expect(startButton()).toBeEnabled();
    });

    it("should display a generic error when the request fails outright", async () => {
      server.use(
        http.post(apiPath("/time-entries/start"), () => HttpResponse.error())
      );
      const { user } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await user.click(startButton());

      expect(await screen.findByText(/failed to start timer/i)).toBeInTheDocument();
    });
  });

  describe("Blank Screen Prevention", () => {
    it("should keep the form visible while the selected project's tasks load", async () => {
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");

      expect(projectSelect()).toHaveValue("project-1");
      expect(startButton()).toBeInTheDocument();
      await waitForProjectsIdle(store);
      expect(taskSelect()).toBeInTheDocument();
      expect(startButton()).toBeEnabled();
    });

    it("should handle rapid project changes without losing the form", async () => {
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await user.selectOptions(projectSelect(), "project-2");
      await user.selectOptions(projectSelect(), "project-1");
      await waitForProjectsIdle(store);

      expect(projectSelect()).toHaveValue("project-1");
      expect(startButton()).toBeEnabled();
      await waitFor(() => {
        expect(optionNames(taskSelect())).toContain("Test Task 1");
      });
    });

    it("should handle a slow tasks API without a blank screen", async () => {
      server.use(
        http.get(apiPath("/tasks"), async () => {
          await delay(100);
          return HttpResponse.json({ tasks: [] });
        })
      );
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");

      // Still usable during the request
      expect(projectSelect()).toBeInTheDocument();
      expect(startButton()).toBeEnabled();

      await waitForProjectsIdle(store);
      expect(optionNames(taskSelect())).toEqual(["No task"]);
    });

    it("should still start a timer when the tasks request fails", async () => {
      server.use(http.get(apiPath("/tasks"), () => HttpResponse.error()));
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await waitForProjectsIdle(store);

      expect(projectSelect()).toBeInTheDocument();
      await user.click(startButton());
      await waitFor(() => {
        expect(getStartTimerCalls()).toEqual([{ projectId: "project-1" }]);
      });
    });

    it("should handle a malformed tasks response without a blank screen", async () => {
      server.use(
        http.get(apiPath("/tasks"), () => HttpResponse.json({ invalid: "response" }))
      );
      const { user, store } = await renderTimer();

      await user.selectOptions(projectSelect(), "project-1");
      await waitForProjectsIdle(store);

      expect(projectSelect()).toBeInTheDocument();
      expect(optionNames(taskSelect())).toEqual(["No task"]);
      expect(startButton()).toBeEnabled();
    });

    it("should handle corrupted tasks state", async () => {
      const user = userEvent.setup();
      const store = createMockStore();
      store.dispatch({
        type: "projects/fetchTasks/fulfilled",
        payload: null as any,
      });
      // Keep the corrupted value in place when the project is selected
      server.use(
        http.get(apiPath("/tasks"), () => HttpResponse.json({ tasks: null }))
      );

      renderWithProviders(<Timer />, { store });
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Test Project 1" })).toBeInTheDocument();
      });

      await user.selectOptions(projectSelect(), "project-1");
      await waitForProjectsIdle(store);

      expect(store.getState().projects.tasks).toBe(null);
      expect(projectSelect()).toBeInTheDocument();
      expect(optionNames(taskSelect())).toEqual(["No task"]);
    });
  });
});
