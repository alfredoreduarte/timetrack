import { describe, it, expect, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import dashboardReducer, {
  computeLiveEarnings,
  selectLiveEarnings,
  DashboardEarnings,
} from "../dashboardSlice";
import timerReducer, { tick } from "../timerSlice";
import type { TimeEntry } from "../timeEntriesSlice";

const baseEarnings = (today: number, thisWeek: number): DashboardEarnings => ({
  currentTimer: { earnings: 0, duration: 0, isRunning: false, hourlyRate: 0 },
  today: { earnings: today, duration: 0 },
  thisWeek: { earnings: thisWeek, duration: 0 },
});

const runningEntry = (
  id: string,
  startTime: string,
  hourlyRateSnapshot: number | null,
  hasProject = true
): TimeEntry => ({
  id,
  startTime,
  duration: null,
  hourlyRateSnapshot,
  // Running entries from the API carry a nested `project` (null when absent),
  // not a flat projectId — the today/thisWeek filter keys off its presence.
  ...(hasProject ? { project: { id: `proj-${id}`, name: "Project" } } : {}),
});

// A Wednesday at noon. Week starts Monday 2026-06-15, day starts 2026-06-17.
const NOW = new Date("2026-06-17T12:00:00").getTime();

describe("computeLiveEarnings", () => {
  it("returns the fetched base untouched when nothing is running", () => {
    const result = computeLiveEarnings(baseEarnings(91.83, 582.11), [], {}, NOW);
    expect(result.today).toBeCloseTo(91.83);
    expect(result.thisWeek).toBeCloseTo(582.11);
    expect(result.currentTimer).toBe(0);
    expect(result.isRunning).toBe(false);
  });

  it("folds a running timer's live earnings into today and this week", () => {
    // Rate 3600/hr == $1/sec, so 5s elapsed == $5.
    const entries = [runningEntry("a", "2026-06-17T09:00:00", 3600)];
    const result = computeLiveEarnings(
      baseEarnings(100, 500),
      entries,
      { a: 5 },
      NOW
    );
    expect(result.currentTimer).toBeCloseTo(5);
    expect(result.today).toBeCloseTo(105);
    expect(result.thisWeek).toBeCloseTo(505);
    expect(result.isRunning).toBe(true);
  });

  it("sums concurrent timers, counting each exactly once", () => {
    // Regression guard for the 'two timers running' class of bug: each running
    // timer must contribute its own earnings once, never doubled or shared.
    const entries = [
      runningEntry("a", "2026-06-17T09:00:00", 3600), // 5s -> $5
      runningEntry("b", "2026-06-17T10:00:00", 7200), // 10s -> $20
    ];
    const result = computeLiveEarnings(
      baseEarnings(100, 500),
      entries,
      { a: 5, b: 10 },
      NOW
    );
    expect(result.currentTimer).toBeCloseTo(25);
    expect(result.today).toBeCloseTo(125);
    expect(result.thisWeek).toBeCloseTo(525);
  });

  it("ignores running timers with no hourly rate", () => {
    const entries = [
      runningEntry("a", "2026-06-17T09:00:00", null),
      runningEntry("b", "2026-06-17T10:00:00", 0),
    ];
    const result = computeLiveEarnings(
      baseEarnings(100, 500),
      entries,
      { a: 999, b: 999 },
      NOW
    );
    expect(result.currentTimer).toBe(0);
    expect(result.today).toBe(100);
    expect(result.thisWeek).toBe(500);
  });

  it("buckets an overnight timer into this week but not today", () => {
    // Started Tuesday 23:00 — before today's start, but still inside this week.
    // Matches how the API buckets the entry (by startTime) once it stops, so
    // the displayed totals stay continuous across the stop + refetch.
    const entries = [runningEntry("a", "2026-06-16T23:00:00", 1)]; // 7200s @ $1/hr -> $2
    const result = computeLiveEarnings(
      baseEarnings(100, 500),
      entries,
      { a: 7200 },
      NOW
    );
    expect(result.currentTimer).toBeCloseTo(2);
    expect(result.today).toBe(100); // excluded from today
    expect(result.thisWeek).toBeCloseTo(502); // included in this week
  });

  it("works with no fetched base yet (delta only)", () => {
    const entries = [runningEntry("a", "2026-06-17T09:00:00", 3600)];
    const result = computeLiveEarnings(null, entries, { a: 5 }, NOW);
    expect(result.today).toBeCloseTo(5);
    expect(result.thisWeek).toBeCloseTo(5);
  });

  it("buckets concurrent timers across day and week boundaries independently", () => {
    // Three timers running at once, each started at a different point:
    //   a - today                -> counts toward today AND this week
    //   b - Monday (this week)   -> counts toward this week only
    //   c - last week (Sunday)   -> counts toward neither, but still earning
    // All three appear in currentTimer / Earning Now.
    const entries = [
      runningEntry("a", "2026-06-17T09:00:00", 3600), // 5s  -> $5
      runningEntry("b", "2026-06-15T10:00:00", 3600), // 10s -> $10
      runningEntry("c", "2026-06-14T10:00:00", 3600), // 20s -> $20
    ];
    const result = computeLiveEarnings(
      baseEarnings(100, 500),
      entries,
      { a: 5, b: 10, c: 20 },
      NOW
    );
    expect(result.today).toBeCloseTo(105); // base + a
    expect(result.thisWeek).toBeCloseTo(515); // base + a + b
    expect(result.currentTimer).toBeCloseTo(35); // a + b + c
    expect(result.isEarning).toBe(true);
  });

  it("keeps a project-less timer out of today/this week but in Earning Now", () => {
    // A timer started without a project still earns at the user's default rate,
    // but the API excludes project-less entries from today/thisWeek. If we
    // folded it into those totals it would vanish downward the moment it stops.
    const entries = [
      runningEntry("a", "2026-06-17T09:00:00", 3600, /* hasProject */ false),
    ];
    const result = computeLiveEarnings(
      baseEarnings(100, 500),
      entries,
      { a: 5 },
      NOW
    );
    expect(result.today).toBe(100); // excluded
    expect(result.thisWeek).toBe(500); // excluded
    expect(result.currentTimer).toBeCloseTo(5); // still earning
    expect(result.isEarning).toBe(true);
  });

  it("reports isEarning false when nothing is running or nothing is paid", () => {
    expect(computeLiveEarnings(baseEarnings(0, 0), [], {}, NOW).isEarning).toBe(
      false
    );
    const unpaid = [runningEntry("a", "2026-06-17T09:00:00", 0)];
    expect(
      computeLiveEarnings(baseEarnings(0, 0), unpaid, { a: 5 }, NOW).isEarning
    ).toBe(false);
  });
});

describe("selectLiveEarnings (live ticking through the store)", () => {
  const makeStore = () =>
    configureStore({ reducer: { dashboard: dashboardReducer, timer: timerReducer } });

  it("advances Today and This Week in lockstep with the timer tick", () => {
    vi.useFakeTimers();
    try {
      const t0 = new Date("2026-06-17T12:00:00");
      vi.setSystemTime(t0);

      const store = makeStore();

      // Fetched base: $100 today, $500 this week (stopped entries only).
      store.dispatch({
        type: "dashboard/fetchEarnings/fulfilled",
        payload: baseEarnings(100, 500),
      });

      // A running timer at $1/sec, started "now".
      store.dispatch({
        type: "timer/startTimer/fulfilled",
        payload: runningEntry("a", t0.toISOString(), 3600),
      });

      // Baseline: no elapsed yet.
      let live = selectLiveEarnings(store.getState() as any);
      expect(live.today).toBeCloseTo(100);
      expect(live.thisWeek).toBeCloseTo(500);

      // 5 seconds later + a tick -> +$5 everywhere.
      vi.setSystemTime(new Date(t0.getTime() + 5_000));
      store.dispatch(tick());
      live = selectLiveEarnings(store.getState() as any);
      expect(live.currentTimer).toBeCloseTo(5);
      expect(live.today).toBeCloseTo(105);
      expect(live.thisWeek).toBeCloseTo(505);

      // 10 seconds -> +$10. The totals keep climbing with wall-clock time.
      vi.setSystemTime(new Date(t0.getTime() + 10_000));
      store.dispatch(tick());
      live = selectLiveEarnings(store.getState() as any);
      expect(live.today).toBeCloseTo(110);
      expect(live.thisWeek).toBeCloseTo(510);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not accumulate when the same instant is ticked many times", () => {
    // Guards the regression this whole approach is built to avoid: multiple
    // useTimer() instances each fire tick() every second, so at one wall-clock
    // instant the reducer is dispatched N times. Because earnings derive from
    // elapsed (recomputed from startTime), repeated ticks at a fixed instant
    // must NOT push Today/This Week past their true value.
    vi.useFakeTimers();
    try {
      const t0 = new Date("2026-06-17T12:00:00");
      vi.setSystemTime(t0);

      const store = makeStore();
      store.dispatch({
        type: "dashboard/fetchEarnings/fulfilled",
        payload: baseEarnings(100, 500),
      });
      store.dispatch({
        type: "timer/startTimer/fulfilled",
        payload: runningEntry("a", t0.toISOString(), 3600),
      });

      vi.setSystemTime(new Date(t0.getTime() + 5_000));
      for (let i = 0; i < 20; i++) store.dispatch(tick());

      const live = selectLiveEarnings(store.getState() as any);
      expect(live.today).toBeCloseTo(105); // not 100 + 20*5
      expect(live.thisWeek).toBeCloseTo(505);
      expect(live.currentTimer).toBeCloseTo(5);
    } finally {
      vi.useRealTimers();
    }
  });
});
