import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { reportsAPI } from "../../services/api";
import { money } from "../../utils/agentFormat";
import Reports from "../Reports";

afterEach(() => {
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

describe("Reports", () => {
  it("shows the week's AI share and every amount in the user's currency, with no multiplier", async () => {
    vi.spyOn(reportsAPI, "getSummaryReport").mockResolvedValue({
      summary: { dailyBreakdown: [{ date: "2026-11-10", totalDuration: 5400, totalEarnings: 1143.6, entryCount: 2 }] },
    } as never);
    vi.spyOn(reportsAPI, "getDetailedReport").mockResolvedValue({
      timeEntries: [entry("agent work", true, 3600, 235.8), entry("review", false, 1800, 907.8)],
    } as never);
    // The chart's ResponsiveContainer needs it; jsdom has none.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const store = configureStore({ reducer: reducers });
    store.dispatch({
      type: "auth/setCredentials",
      payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test", currency: "EUR" }, token: "t" },
    });
    renderWithProviders(<Reports />, { store });

    const aiLine = `AI work this week: 1.00 h · ${money(235.8, "EUR")}`;
    expect(await screen.findByText((_, el) => el?.tagName === "P" && el.textContent?.trim() === aiLine)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(money(1143.6, "EUR")).length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toMatch(/multiplier|×/i);
    expect(document.body.textContent).not.toContain("$");
  });

  it("names the week the AI figures are from, and shows nothing without AI work", async () => {
    vi.spyOn(reportsAPI, "getSummaryReport").mockResolvedValue({ summary: { dailyBreakdown: [] } } as never);
    vi.spyOn(reportsAPI, "getDetailedReport")
      .mockResolvedValueOnce({ timeEntries: [entry("this week", true, 3600, 100)] } as never)
      .mockResolvedValueOnce({ timeEntries: [entry("last week", true, 7200, 200)] } as never)
      .mockResolvedValueOnce({ timeEntries: [entry("human only", false, 3600, 80)] } as never);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const store = configureStore({ reducer: reducers });
    store.dispatch({
      type: "auth/setCredentials",
      payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test", currency: "USD" }, token: "t" },
    });
    renderWithProviders(<Reports />, { store });
    const line = (text: string) => screen.findByText((_, el) => el?.tagName === "P" && el.textContent?.trim() === text);

    expect(await line(`AI work this week: 1.00 h · ${money(100, "USD")}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(await line(`AI work last week: 2.00 h · ${money(200, "USD")}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await waitFor(() => expect(store.getState().reports.detailedWeekOffset).toBe(-2));
    expect(document.body.textContent).not.toContain("AI work");
  });
});
