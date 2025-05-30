import { describe, it, expect, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import timerSlice, {
  startTimer,
  stopTimer,
  fetchCurrentEntry,
  tick,
  resetTimer,
  clearError,
} from "../timerSlice";
import {
  server,
  resetMockData,
  setMockCurrentEntry,
} from "../../../test/mocks/server";

// Create a test store
const createTestStore = () => {
  return configureStore({
    reducer: {
      timer: timerSlice,
    },
  });
};

describe("timerSlice", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const store = createTestStore();
      const state = store.getState().timer;

      expect(state).toEqual({
        isRunning: false,
        currentEntry: null,
        elapsedTime: 0,
        loading: false,
        error: null,
      });
    });
  });

  describe("reducers", () => {
    it("should handle tick action when timer is running", () => {
      const store = createTestStore();

      // Set up running state
      store.dispatch({
        type: "timer/startTimer/fulfilled",
        payload: {
          id: "test-entry",
          description: "Test work",
          startTime: new Date().toISOString(),
          duration: 0,
          projectId: "project-1",
          userId: "user-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      // Tick the timer
      store.dispatch(tick());

      const state = store.getState().timer;
      expect(state.elapsedTime).toBe(1);
      expect(state.currentEntry?.duration).toBe(1);
    });

    it("should not tick when timer is not running", () => {
      const store = createTestStore();

      store.dispatch(tick());

      const state = store.getState().timer;
      expect(state.elapsedTime).toBe(0);
    });

    it("should handle resetTimer action", () => {
      const store = createTestStore();

      // Set up some state
      store.dispatch({
        type: "timer/startTimer/fulfilled",
        payload: {
          id: "test-entry",
          description: "Test work",
          startTime: new Date().toISOString(),
          duration: 10,
          projectId: "project-1",
          userId: "user-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      store.dispatch(resetTimer());

      const state = store.getState().timer;
      expect(state.isRunning).toBe(false);
      expect(state.currentEntry).toBe(null);
      expect(state.elapsedTime).toBe(0);
      expect(state.error).toBe(null);
    });

    it("should handle clearError action", () => {
      const store = createTestStore();

      // Set an error
      store.dispatch({
        type: "timer/startTimer/rejected",
        payload: "Test error",
      });

      store.dispatch(clearError());

      const state = store.getState().timer;
      expect(state.error).toBe(null);
    });
  });

  describe("startTimer async thunk", () => {
    it("should handle successful timer start", async () => {
      const store = createTestStore();

      const result = await store.dispatch(
        startTimer({
          projectId: "project-1",
          taskId: "task-1",
          description: "Test work",
        })
      );

      expect(result.type).toBe("timer/startTimer/fulfilled");

      const state = store.getState().timer;
      expect(state.loading).toBe(false);
      expect(state.isRunning).toBe(true);
      expect(state.currentEntry).toBeTruthy();
      expect(state.currentEntry?.projectId).toBe("project-1");
      expect(state.currentEntry?.taskId).toBe("task-1");
      expect(state.currentEntry?.description).toBe("Test work");
      expect(state.error).toBe(null);
    });

    it("should handle timer start without project ID", async () => {
      const store = createTestStore();

      const result = await store.dispatch(
        startTimer({
          description: "Test work without project",
        })
      );

      expect(result.type).toBe("timer/startTimer/rejected");

      const state = store.getState().timer;
      expect(state.loading).toBe(false);
      expect(state.isRunning).toBe(false);
      expect(state.currentEntry).toBe(null);
      expect(state.error).toBe("Failed to start timer");
    });

    it("should handle timer start with only project ID", async () => {
      const store = createTestStore();

      const result = await store.dispatch(
        startTimer({
          projectId: "project-1",
        })
      );

      expect(result.type).toBe("timer/startTimer/fulfilled");

      const state = store.getState().timer;
      expect(state.isRunning).toBe(true);
      expect(state.currentEntry?.projectId).toBe("project-1");
      expect(state.currentEntry?.taskId).toBe(null);
      expect(state.currentEntry?.description).toBe("");
    });

    it("should set loading state during timer start", async () => {
      const store = createTestStore();

      const promise = store.dispatch(
        startTimer({
          projectId: "project-1",
        })
      );

      // Check loading state
      let state = store.getState().timer;
      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);

      await promise;

      // Check final state
      state = store.getState().timer;
      expect(state.loading).toBe(false);
    });
  });

  describe("stopTimer async thunk", () => {
    it("should handle successful timer stop", async () => {
      const store = createTestStore();

      // Start timer first
      await store.dispatch(
        startTimer({
          projectId: "project-1",
        })
      );

      const currentEntry = store.getState().timer.currentEntry;
      expect(currentEntry).toBeTruthy();

      // Stop timer
      const result = await store.dispatch(stopTimer(currentEntry!.id));

      expect(result.type).toBe("timer/stopTimer/fulfilled");

      const state = store.getState().timer;
      expect(state.loading).toBe(false);
      expect(state.isRunning).toBe(false);
      expect(state.currentEntry).toBe(null);
      expect(state.elapsedTime).toBe(0);
      expect(state.error).toBe(null);
    });

    it("should handle stop timer with invalid ID", async () => {
      const store = createTestStore();

      const result = await store.dispatch(stopTimer("invalid-id"));

      expect(result.type).toBe("timer/stopTimer/rejected");

      const state = store.getState().timer;
      expect(state.loading).toBe(false);
      expect(state.error).toBe("Failed to stop timer");
    });

    it("should set loading state during timer stop", async () => {
      const store = createTestStore();

      // Start timer first
      await store.dispatch(
        startTimer({
          projectId: "project-1",
        })
      );

      const currentEntry = store.getState().timer.currentEntry;

      const promise = store.dispatch(stopTimer(currentEntry!.id));

      // Check loading state
      let state = store.getState().timer;
      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);

      await promise;

      // Check final state
      state = store.getState().timer;
      expect(state.loading).toBe(false);
    });
  });

  describe("fetchCurrentEntry async thunk", () => {
    it("should handle fetching existing current entry", async () => {
      const mockEntry = {
        id: "current-entry",
        description: "Existing work",
        startTime: new Date(Date.now() - 5000).toISOString(),
        endTime: null,
        duration: 5,
        projectId: "project-1",
        taskId: "task-1",
        userId: "user-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMockCurrentEntry(mockEntry);

      const store = createTestStore();

      const result = await store.dispatch(fetchCurrentEntry());

      expect(result.type).toBe("timer/fetchCurrentEntry/fulfilled");

      const state = store.getState().timer;
      expect(state.isRunning).toBe(true);
      expect(state.currentEntry).toEqual(mockEntry);
      expect(state.elapsedTime).toBeGreaterThan(0); // Should calculate elapsed time
    });

    it("should handle no current entry", async () => {
      const store = createTestStore();

      const result = await store.dispatch(fetchCurrentEntry());

      expect(result.type).toBe("timer/fetchCurrentEntry/fulfilled");

      const state = store.getState().timer;
      expect(state.isRunning).toBe(false);
      expect(state.currentEntry).toBe(null);
      expect(state.elapsedTime).toBe(0);
    });

    it("should handle API returning null timeEntry gracefully", async () => {
      // This test ensures that when the API returns { timeEntry: null },
      // the frontend handles it correctly
      const store = createTestStore();

      // Explicitly set mock to null to get { timeEntry: null } response
      setMockCurrentEntry(null);

      const result = await store.dispatch(fetchCurrentEntry());

      expect(result.type).toBe("timer/fetchCurrentEntry/fulfilled");
      expect(result.payload).toBe(null);

      const state = store.getState().timer;
      expect(state.isRunning).toBe(false);
      expect(state.currentEntry).toBe(null);
      expect(state.elapsedTime).toBe(0);
      expect(state.error).toBe(null);
    });

    it("should handle legacy 404 responses gracefully for backward compatibility", async () => {
      // This test ensures backward compatibility with legacy API behavior
      // that might still return 404 for no current entry
      const store = createTestStore();

      // Mock a 404 response directly using MSW
      const { server } = await import("../../../test/mocks/server");
      const { http, HttpResponse } = await import("msw");

      server.use(
        http.get("http://localhost:3011/time-entries/current", () => {
          return HttpResponse.json(
            { message: "No running time entry found" },
            { status: 404 }
          );
        })
      );

      const result = await store.dispatch(fetchCurrentEntry());

      // Should handle 404 gracefully and return fulfilled with null
      expect(result.type).toBe("timer/fetchCurrentEntry/fulfilled");
      expect(result.payload).toBe(null);

      const state = store.getState().timer;
      expect(state.isRunning).toBe(false);
      expect(state.currentEntry).toBe(null);
      expect(state.elapsedTime).toBe(0);
      expect(state.error).toBe(null);
    });

    it("should calculate elapsed time correctly", async () => {
      const startTime = new Date(Date.now() - 10000); // 10 seconds ago
      const mockEntry = {
        id: "current-entry",
        description: "Existing work",
        startTime: startTime.toISOString(),
        endTime: null,
        duration: 0,
        projectId: "project-1",
        userId: "user-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMockCurrentEntry(mockEntry);

      const store = createTestStore();

      await store.dispatch(fetchCurrentEntry());

      const state = store.getState().timer;
      expect(state.elapsedTime).toBeGreaterThanOrEqual(9); // Should be around 10 seconds
      expect(state.elapsedTime).toBeLessThanOrEqual(11);
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle multiple rapid start/stop calls", async () => {
      const store = createTestStore();

      // Start timer
      const startResult = await store.dispatch(
        startTimer({ projectId: "project-1" })
      );
      expect(startResult.type).toBe("timer/startTimer/fulfilled");

      const currentEntry = store.getState().timer.currentEntry;

      // Stop timer immediately
      const stopResult = await store.dispatch(stopTimer(currentEntry!.id));
      expect(stopResult.type).toBe("timer/stopTimer/fulfilled");

      // Start again
      const startResult2 = await store.dispatch(
        startTimer({ projectId: "project-2" })
      );
      expect(startResult2.type).toBe("timer/startTimer/fulfilled");

      const finalState = store.getState().timer;
      expect(finalState.isRunning).toBe(true);
      expect(finalState.currentEntry?.projectId).toBe("project-2");
    });

    it("should handle timer tick with null current entry", () => {
      const store = createTestStore();

      // Manually set running state without current entry (edge case)
      store.dispatch({
        type: "timer/startTimer/fulfilled",
        payload: null,
      });

      // This should not crash
      store.dispatch(tick());

      const state = store.getState().timer;
      expect(state.elapsedTime).toBe(0);
    });

    it("should preserve project selection across timer operations", async () => {
      const store = createTestStore();

      // Start timer with specific project and task
      await store.dispatch(
        startTimer({
          projectId: "project-1",
          taskId: "task-1",
          description: "Important work",
        })
      );

      let state = store.getState().timer;
      expect(state.currentEntry?.projectId).toBe("project-1");
      expect(state.currentEntry?.taskId).toBe("task-1");
      expect(state.currentEntry?.description).toBe("Important work");

      // Stop timer
      await store.dispatch(stopTimer(state.currentEntry!.id));

      // State should be reset
      state = store.getState().timer;
      expect(state.currentEntry).toBe(null);
      expect(state.isRunning).toBe(false);
    });
  });
});
