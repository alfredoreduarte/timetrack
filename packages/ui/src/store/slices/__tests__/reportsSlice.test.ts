import { describe, it, expect, vi, afterEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { reducers } from "../../reducers";
import { reportsAPI } from "../../../services/api";
import { fetchWeeklyData, fetchDetailedTimeEntries, getWeekDates } from "../reportsSlice";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A promise settled from outside, to control which request answers first. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const store = () => configureStore({ reducer: reducers });
const summary = { summary: { dailyBreakdown: [] } };

describe("reports slice: only the latest request counts", () => {
  it("a slower weekly response for another week is ignored", async () => {
    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    vi.spyOn(reportsAPI, "getSummaryReport")
      .mockReturnValueOnce(older.promise as never)
      .mockReturnValueOnce(newer.promise as never);
    const s = store();
    const a = s.dispatch(fetchWeeklyData(-1));
    const b = s.dispatch(fetchWeeklyData(0));
    newer.resolve(summary);
    await b;
    const week0 = s.getState().reports.weeklyData?.weekStartDate;
    older.resolve(summary);
    await a;
    const state = s.getState().reports;
    expect(state.currentWeekOffset).toBe(0);
    expect(state.weeklyData?.weekStartDate).toBe(week0);
    expect(state.loading).toBe(false);
  });

  it("a stale weekly failure leaves the newer week and no error", async () => {
    const older = deferred<unknown>();
    vi.spyOn(reportsAPI, "getSummaryReport")
      .mockReturnValueOnce(older.promise as never)
      .mockResolvedValueOnce(summary as never);
    const s = store();
    const a = s.dispatch(fetchWeeklyData(-1));
    await s.dispatch(fetchWeeklyData(0));
    older.reject(new Error("timeout"));
    await a;
    const state = s.getState().reports;
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.currentWeekOffset).toBe(0);
  });

  it("a stale detailed failure leaves the newer entries and no error", async () => {
    const older = deferred<unknown>();
    vi.spyOn(reportsAPI, "getDetailedReport")
      .mockReturnValueOnce(older.promise as never)
      .mockResolvedValueOnce({ timeEntries: [{ id: "e1" }] } as never);
    const s = store();
    const a = s.dispatch(fetchDetailedTimeEntries(-1));
    await s.dispatch(fetchDetailedTimeEntries(0));
    older.reject(new Error("timeout"));
    await a;
    const state = s.getState().reports;
    expect(state.error).toBeNull();
    expect(state.detailedLoading).toBe(false);
    expect(state.detailedWeekStart).toBe(getWeekDates(0).startDate);
    expect(state.detailedEntries.map((e) => e.id)).toEqual(["e1"]);
  });
});
