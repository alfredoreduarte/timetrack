import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { reportsAPI } from "../../services/api";
import { getWeekDates } from "../../store/slices/reportsSlice";
import { money } from "../../utils/agentFormat";
import Reports from "../Reports";

beforeEach(() => {
  // Wed Nov 11 2026, so the chart's week (built from the clock) is fixed.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 11, 12, 0));
  // The chart's ResponsiveContainer needs it; jsdom has none.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const entry = (id: string, isAiGenerated: boolean, duration: number, earnings: number) => ({
  id,
  description: id,
  startTime: "2026-11-10T12:00:00.000Z",
  endTime: "2026-11-10T13:00:00.000Z",
  duration,
  hourlyRateSnapshot: 80,
  earnings,
  isAiGenerated,
  project: { id: "p1", name: "Acme", color: "#3B82F6" },
  task: null,
});

// Formatted as the page does, in whatever locale the tests run under.
const hours = (h: number) => `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(h)} h`;
const aiLine = (week: string, h: number, amount: number, currency: string) =>
  `AI work ${week}: ${hours(h)} · ${money(amount, currency)}`;
const findParagraph = (text: string) =>
  screen.findByText((_, el) => el?.tagName === "P" && el.textContent?.trim() === text);
const queryParagraph = (text: string) =>
  screen.queryByText((_, el) => el?.tagName === "P" && el.textContent?.trim() === text);

function renderAs(currency: string) {
  const store = configureStore({ reducer: reducers });
  store.dispatch({
    type: "auth/setCredentials",
    payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test", currency }, token: "t" },
  });
  renderWithProviders(<Reports />, { store });
  return store;
}

/** A promise resolved from outside, to control which request answers first. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("Reports", () => {
  it("shows the week's AI share and every amount in the user's currency, with no multiplier", async () => {
    vi.spyOn(reportsAPI, "getSummaryReport").mockResolvedValue({
      summary: {
        dailyBreakdown: ["2026-11-09", "2026-11-10", "2026-11-11"].map((date) => ({ date, totalDuration: 1800, totalEarnings: 166.664, entryCount: 1 })),
      },
    } as never);
    vi.spyOn(reportsAPI, "getDetailedReport").mockResolvedValue({
      timeEntries: [entry("agent work", true, 3600, 235.8), entry("review", false, 1800, 907.8)],
    } as never);
    renderAs("EUR");

    expect(await findParagraph(aiLine("this week", 1, 235.8, "EUR"))).toBeTruthy();
    // The chart's own total (not the table's 1143.60), from the unrounded days:
    // 499.992 shows as 499.99, where per-day rounding (166.66 × 3) gave 499.98.
    const label = await screen.findByText("Total Earnings");
    await waitFor(() => expect(label.previousElementSibling?.textContent?.trim()).toBe(money(499.99, "EUR")));
    expect(document.body.textContent).toContain(money(1143.6, "EUR"));
    expect(document.body.textContent).not.toMatch(/multiplier|×/i);
    expect(document.body.textContent).not.toContain("$");
  });

  it("names the week the AI figures are from (this week, last week, or its dates), even while the next week loads", async () => {
    vi.spyOn(reportsAPI, "getSummaryReport").mockResolvedValue({ summary: { dailyBreakdown: [] } } as never);
    const lastWeek = deferred<unknown>();
    vi.spyOn(reportsAPI, "getDetailedReport")
      .mockResolvedValueOnce({ timeEntries: [entry("this week", true, 3600, 100)] } as never)
      .mockReturnValueOnce(lastWeek.promise as never)
      .mockResolvedValueOnce({ timeEntries: [entry("two weeks ago", true, 1800, 40)] } as never)
      .mockResolvedValueOnce({ timeEntries: [entry("human only", false, 3600, 80)] } as never);
    const store = renderAs("USD");

    expect(await findParagraph(aiLine("this week", 1, 100, "USD"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    // The chart has moved to last week; the entries haven't arrived yet.
    await waitFor(() => expect(store.getState().reports.currentWeekOffset).toBe(-1));
    expect(queryParagraph(aiLine("this week", 1, 100, "USD"))).toBeTruthy();
    lastWeek.resolve({ timeEntries: [entry("last week", true, 7200, 200)] });
    expect(await findParagraph(aiLine("last week", 2, 200, "USD"))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(await findParagraph(aiLine("Oct 26 – Nov 1", 0.5, 40, "USD"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await waitFor(() => expect(store.getState().reports.detailedWeekStart).toBe(getWeekDates(-3).startDate));
    expect(document.body.textContent).not.toContain("AI work");
  });

  it("ignores a slower response for a week the user already left", async () => {
    const weekly = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    const detailed = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    let w = 0;
    let d = 0;
    vi.spyOn(reportsAPI, "getSummaryReport").mockImplementation(() => weekly[w++].promise as never);
    vi.spyOn(reportsAPI, "getDetailedReport").mockImplementation(() => detailed[d++].promise as never);
    const store = renderAs("USD");
    weekly[0].resolve({ summary: { dailyBreakdown: [] } });
    detailed[0].resolve({ timeEntries: [] });
    await waitFor(() => expect(store.getState().reports.loading).toBe(false));

    // Two weeks back in quick succession: week -1's entries come in last.
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    weekly[1].resolve({ summary: { dailyBreakdown: [] } });
    await waitFor(() => expect(store.getState().reports.currentWeekOffset).toBe(-1));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    weekly[2].resolve({ summary: { dailyBreakdown: [] } });
    detailed[2].resolve({ timeEntries: [entry("week -2", true, 3600, 50)] });
    expect(await findParagraph(aiLine("Oct 26 – Nov 1", 1, 50, "USD"))).toBeTruthy();
    detailed[1].resolve({ timeEntries: [entry("week -1", true, 7200, 999)] });
    await new Promise((r) => setTimeout(r, 20));

    const state = store.getState().reports;
    expect(state.currentWeekOffset).toBe(-2);
    expect(state.detailedWeekStart).toBe(getWeekDates(-2).startDate);
    expect(state.detailedLoading).toBe(false);
    expect(queryParagraph(aiLine("Oct 26 – Nov 1", 1, 50, "USD"))).toBeTruthy();
  });

  it("an older week's figures keep their dates while the next week loads, or if it fails", async () => {
    vi.spyOn(reportsAPI, "getSummaryReport").mockResolvedValue({ summary: { dailyBreakdown: [] } } as never);
    let rejectThreeBack!: (e: unknown) => void;
    const failing = new Promise((_, rej) => (rejectThreeBack = rej));
    vi.spyOn(reportsAPI, "getDetailedReport")
      .mockResolvedValueOnce({ timeEntries: [] } as never) // this week
      .mockResolvedValueOnce({ timeEntries: [] } as never) // last week
      .mockResolvedValueOnce({ timeEntries: [entry("two back", true, 7200, 222)] } as never) // Oct 26 – Nov 1
      .mockReturnValueOnce(failing as never); // Oct 19 – 25
    const store = renderAs("USD");
    await waitFor(() => expect(store.getState().reports.loading).toBe(false));
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
      await waitFor(() => expect(store.getState().reports.loading).toBe(false));
    }
    const twoBack = aiLine("Oct 26 – Nov 1", 2, 222, "USD");
    expect(await findParagraph(twoBack)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await waitFor(() => expect(store.getState().reports.currentWeekOffset).toBe(-3));
    // The chart shows Oct 19 – 25; the line still says whose figures it has.
    expect(queryParagraph(twoBack)).toBeTruthy();
    rejectThreeBack(new Error("timeout"));
    await waitFor(() => expect(store.getState().reports.detailedLoading).toBe(false));
    expect(queryParagraph(twoBack)).toBeTruthy();
  });

  it("names the figures' week as it was requested, even after the clock passes Monday", async () => {
    vi.spyOn(reportsAPI, "getSummaryReport").mockResolvedValue({ summary: { dailyBreakdown: [] } } as never);
    let rejectNext!: (e: unknown) => void;
    vi.spyOn(reportsAPI, "getDetailedReport")
      .mockResolvedValueOnce({ timeEntries: [entry("this week", true, 3600, 100)] } as never)
      .mockReturnValueOnce(new Promise((_, rej) => (rejectNext = rej)) as never);
    const store = renderAs("USD");
    expect(await findParagraph(aiLine("this week", 1, 100, "USD"))).toBeTruthy();

    // The page stays open into the next week (Mon Nov 16), then moves back.
    vi.setSystemTime(new Date(2026, 10, 16, 0, 5));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await waitFor(() => expect(store.getState().reports.currentWeekOffset).toBe(-1));
    // The figures were fetched for Nov 9 – 15, which is now last week.
    expect(queryParagraph(aiLine("last week", 1, 100, "USD"))).toBeTruthy();
    rejectNext(new Error("timeout"));
    await waitFor(() => expect(store.getState().reports.detailedLoading).toBe(false));
    expect(queryParagraph(aiLine("last week", 1, 100, "USD"))).toBeTruthy();
  });
});
