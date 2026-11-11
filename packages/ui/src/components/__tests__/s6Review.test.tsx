import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { rangeFor } from "../../pages/Timesheet";
import { noteAddedFromSocket, timerFromSocket } from "../../store/slices/timersSlice";
import AgentBillingSettings from "../AgentBillingSettings";
import { authAPI } from "../../services/api";
import type { Timer } from "../../types/agent";

afterEach(() => vi.restoreAllMocks());

describe("S6 review fixes", () => {
  it("every timesheet preset has a real end, so shared periods stop", () => {
    const now = new Date(2026, 10, 11, 15, 30); // Wed Nov 11 2026, local time
    const week = rangeFor("this-week", now);
    expect(new Date(week.startDate)).toEqual(new Date(2026, 10, 9));
    expect(new Date(week.endDate)).toEqual(new Date(2026, 10, 16));
    const month = rangeFor("this-month", now);
    expect(new Date(month.startDate)).toEqual(new Date(2026, 10, 1));
    expect(new Date(month.endDate)).toEqual(new Date(2026, 11, 1));
    const last = rangeFor("last-month", now);
    expect(new Date(last.startDate)).toEqual(new Date(2026, 9, 1));
    expect(new Date(last.endDate)).toEqual(new Date(2026, 10, 1));
  });

  it("note events bump the board's note count", () => {
    const store = configureStore({ reducer: reducers });
    store.dispatch(timerFromSocket({ id: "t1", status: "running", noteCount: 0 } as unknown as Timer));
    store.dispatch(noteAddedFromSocket("t1"));
    expect(store.getState().timers.items[0].noteCount).toBe(1);
  });

  it("agent billing settings save only the fields that changed", async () => {
    const spy = vi.spyOn(authAPI, "updateProfile").mockResolvedValue({
      id: "u1",
      name: "Ada",
      email: "ada@dev.test",
      agentIdleTimeoutSeconds: 600,
      overlapMode: "sum",
      currency: "EUR",
    } as never);
    const store = configureStore({ reducer: reducers });
    store.dispatch({
      type: "auth/setCredentials",
      payload: {
        user: { id: "u1", name: "Ada", email: "ada@dev.test", agentIdleTimeoutSeconds: 1800, overlapMode: "sum", currency: "EUR" },
        token: "t",
      },
    });
    renderWithProviders(<AgentBillingSettings />, { store });
    const minutes = await screen.findByDisplayValue("30");
    fireEvent.change(minutes, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ agentIdleTimeoutSeconds: 600 }));
  });
});
