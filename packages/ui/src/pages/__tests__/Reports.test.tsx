import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
});
