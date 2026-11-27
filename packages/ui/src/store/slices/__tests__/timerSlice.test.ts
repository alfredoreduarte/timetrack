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
import { http, HttpResponse } from "msw";
import {
  apiPath,
  resetMockData,
  server,
  setMockCurrentEntry,
  setMockTimeEntries,
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

    it("should start an unassigned timer without a project ID", async () => {
      // The API accepts timers with no project (assigned later, e.g. from the board)
      const store = createTestStore();

      const result = await store.dispatch(
        startTimer({
          description: "Test work without project",
        })
      );

      expect(result.type).toBe("timer/startTimer/fulfilled");

      const state = store.getState().timer;
      expect(state.isRunning).toBe(true);
      expect(state.currentEntry?.projectId).toBe(null);
      expect(state.currentEntry?.description).toBe("Test work without project");
    });

    it("should surface the API error message when the start is rejected", async () => {
      // Not a 429: the API client treats any 429 as rate limiting and blocks
      // every request for up to 60s, which would leak into later tests.
      server.use(
        http.post(apiPath("/time-entries/start"), () =>
          HttpResponse.json({ error: "Project not found" }, { status: 404 })
        )
      );
      const store = createTestStore();

      const result = await store.dispatch(startTimer({ projectId: "project-1" }));

      expect(result.type).toBe("timer/startTimer/rejected");
      const state = store.getState().timer;
      expect(state.loading).toBe(false);
      expect(state.isRunning).toBe(false);
      expect(state.currentEntry).toBe(null);
      expect(state.error).toBe("Project not found");
    });

    it("should fall back to a generic error when the API gives no message", async () => {
      server.use(
        http.post(apiPath("/time-entries/start"), () => HttpResponse.error())
      );
      const store = createTestStore();

      const result = await store.dispatch(startTimer({ projectId: "project-1" }));

      expect(result.type).toBe("timer/startTimer/rejected");
      expect(store.getState().timer.error).toBe("Failed to start timer");
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
      expect(state.currentEntry?.description).toBe(null);
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
      expect(state.stoppingIds).toEqual({});
      expect(state.error).toBe("Time entry not found");
    });

    it("should stop only the given timer when several are running", async () => {
      const store = createTestStore();

      await store.dispatch(startTimer({ projectId: "project-1" }));
      const first = store.getState().timer.currentEntry!;
      await store.dispatch(startTimer({ projectId: "project-2" }));
      const second = store.getState().timer.currentEntry!;
      expect(store.getState().timer.runningEntries).toHaveLength(2);

      await store.dispatch(stopTimer(second.id));

      const state = store.getState().timer;
      expect(state.runningEntries.map((e) => e.id)).toEqual([first.id]);
      expect(state.isRunning).toBe(true);
      expect(state.currentEntry?.id).toBe(first.id);
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

    it("should track every running entry, most recent first", async () => {
      const startedAt = (secondsAgo: number) =>
        new Date(Date.now() - secondsAgo * 1000).toISOString();
      const entry = (id: string, secondsAgo: number) => ({
        id,
        description: id,
        startTime: startedAt(secondsAgo),
        endTime: null,
        duration: null,
        projectId: "project-1",
      });
      // GET /time-entries/running returns newest first
      setMockTimeEntries([entry("newer", 60), entry("older", 600)]);

      const store = createTestStore();
      const result = await store.dispatch(fetchRunningEntries());

      expect(result.type).toBe("timer/fetchRunningEntries/fulfilled");
      const state = store.getState().timer;
      expect(state.runningEntries.map((e) => e.id)).toEqual(["newer", "older"]);
      expect(state.currentEntry?.id).toBe("newer");
      expect(state.elapsedById.newer).toBeGreaterThanOrEqual(59);
      expect(state.elapsedById.older).toBeGreaterThanOrEqual(599);
      expect(state.elapsedTime).toBe(state.elapsedById.newer);
    });

    it("should replace stale running entries with the server's list", async () => {
      const store = createTestStore();
      await store.dispatch(startTimer({ projectId: "project-1" }));
      expect(store.getState().timer.isRunning).toBe(true);

      // Stopped elsewhere: the server no longer reports it as running
      resetMockData();
      await store.dispatch(fetchRunningEntries());

      const state = store.getState().timer;
      expect(state.runningEntries).toEqual([]);
      expect(state.elapsedById).toEqual({});
      expect(state.isRunning).toBe(false);
      expect(state.currentEntry).toBe(null);
    });

    it("should keep the current state when the running list can't be fetched", async () => {
      const store = createTestStore();
      await store.dispatch(startTimer({ projectId: "project-1" }));
      const before = store.getState().timer.runningEntries;

      server.use(
        http.get(apiPath("/time-entries/running"), () =>
          HttpResponse.json({ error: "Server error" }, { status: 500 })
        )
      );
      const result = await store.dispatch(fetchRunningEntries());

      expect(result.type).toBe("timer/fetchRunningEntries/rejected");
      const state = store.getState().timer;
      expect(state.fetchingCurrentEntry).toBe(false);
      expect(state.runningEntries).toEqual(before);
      expect(state.isRunning).toBe(true);
      expect(state.error).toBe(null);
    });

    it("should skip a fetch while another one is in flight", async () => {
      const store = createTestStore();

      const first = store.dispatch(fetchRunningEntries());
      const second = await store.dispatch(fetchRunningEntries());
      await first;

      // A condition-skipped thunk resolves to a rejected action flagged meta.condition
      expect(
        fetchRunningEntries.rejected.match(second) && second.meta.condition
      ).toBe(true);
      expect(store.getState().timer.fetchingCurrentEntry).toBe(false);
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
