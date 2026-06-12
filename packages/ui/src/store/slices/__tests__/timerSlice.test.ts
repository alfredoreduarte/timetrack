import { describe, it, expect, beforeEach, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import timerSlice, {
  startTimer,
  stopTimer,
  fetchRunningEntries,
  tick,
  resetTimer,
  clearError,
} from "../timerSlice";
import {
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
        runningEntries: [],
        elapsedById: {},
        stoppingIds: {},
        isRunning: false,
        currentEntry: null,
        elapsedTime: 0,
        loading: false,
        fetchingCurrentEntry: false,
        error: null,
      });
    });
  });

  describe("reducers", () => {
    it("tick computes elapsed from wall-clock startTime and is idempotent", () => {
      // Regression test for the "timer adds N seconds per second" bug:
      // 12 components call useTimer(), each setting up its own 1Hz interval
      // dispatching tick(). The previous +1-per-call implementation caused
      // elapsed to grow at N seconds per real second with N mounts. tick()
      // must now be idempotent — recomputing from startTime so multiple
      // intervals converge to the same value.
      vi.useFakeTimers();
      try {
        const t0 = new Date("2026-06-12T00:00:00Z");
        vi.setSystemTime(t0);

        const store = createTestStore();
        store.dispatch({
          type: "timer/startTimer/fulfilled",
          payload: {
            id: "test-entry",
            description: "Test work",
            startTime: t0.toISOString(),
            duration: 0,
            projectId: "project-1",
            userId: "user-1",
            createdAt: t0.toISOString(),
            updatedAt: t0.toISOString(),
          },
        });

        // Advance wall-clock 5 seconds, tick once
        vi.setSystemTime(new Date(t0.getTime() + 5_000));
        store.dispatch(tick());
        expect(store.getState().timer.elapsedTime).toBe(5);

        // Idempotency: ticking many more times at the same wall-clock instant
        // must NOT advance elapsed past 5. Before this fix, 15 calls would
        // bump elapsed by 15 — the exact symptom users reported in prod.
        for (let i = 0; i < 15; i++) store.dispatch(tick());
        expect(store.getState().timer.elapsedTime).toBe(5);

        // Advancing the clock another 3s + ticking lands at 8, not 8+15.
        vi.setSystemTime(new Date(t0.getTime() + 8_000));
        store.dispatch(tick());
        expect(store.getState().timer.elapsedTime).toBe(8);
      } finally {
        vi.useRealTimers();
      }
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

  describe("fetchRunningEntries async thunk", () => {
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

      const result = await store.dispatch(fetchRunningEntries());

      expect(result.type).toBe("timer/fetchRunningEntries/fulfilled");

      const state = store.getState().timer;
      expect(state.isRunning).toBe(true);
      expect(state.currentEntry).toEqual(mockEntry);
      expect(state.elapsedTime).toBeGreaterThan(0); // Should calculate elapsed time
    });

    it("should handle no current entry", async () => {
      const store = createTestStore();

      const result = await store.dispatch(fetchRunningEntries());

      expect(result.type).toBe("timer/fetchRunningEntries/fulfilled");

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

      const result = await store.dispatch(fetchRunningEntries());

      expect(result.type).toBe("timer/fetchRunningEntries/fulfilled");
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

      const result = await store.dispatch(fetchRunningEntries());

      // Should handle 404 gracefully and return fulfilled with null
      expect(result.type).toBe("timer/fetchRunningEntries/fulfilled");
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

      await store.dispatch(fetchRunningEntries());

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
