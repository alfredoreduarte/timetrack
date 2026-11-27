import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { reportsAPI } from "../../services/api";
import { money } from "../../utils/agentFormat";
import Reports from "../Reports";

// Runs in its own process (see poolMatchGlobs), where switching TZ works.
const previousTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Berlin";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 11, 12, 0)); // Wed Nov 11 2026, Berlin
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
  vi.restoreAllMocks();
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

describe("Reports east of UTC", () => {
  it("keeps Monday to Sunday: Sunday's work counts and the header shows the right days", async () => {
    // Guard: the zone switch really applied (UTC+1 in November).
    expect(new Date(2026, 10, 11).getTimezoneOffset()).toBe(-60);
    // The API keys days by the user's local date.
    vi.spyOn(reportsAPI, "getSummaryReport").mockResolvedValue({
      summary: {
        dailyBreakdown: [
          { date: "2026-11-09", totalDuration: 3600, totalEarnings: 100, entryCount: 1 },
          { date: "2026-11-15", totalDuration: 3600, totalEarnings: 100, entryCount: 1 },
        ],
      },
    } as never);
    vi.spyOn(reportsAPI, "getDetailedReport").mockResolvedValue({ timeEntries: [] } as never);
    const store = configureStore({ reducer: reducers });
    store.dispatch({
      type: "auth/setCredentials",
      payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test", currency: "USD" }, token: "t" },
    });
    renderWithProviders(<Reports />, { store });

    const label = await screen.findByText("Total Earnings");
    await waitFor(() => expect(label.previousElementSibling?.textContent?.trim()).toBe(money(200, "USD")));
    expect(screen.getByText("Nov 9 - Nov 15, 2026")).toBeTruthy();
  });
});
