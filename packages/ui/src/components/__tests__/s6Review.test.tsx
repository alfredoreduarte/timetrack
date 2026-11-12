import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { rangeFor } from "../../pages/Timesheet";
import { noteAddedFromSocket, timerFromSocket } from "../../store/slices/timersSlice";
import AgentBillingSettings from "../AgentBillingSettings";
import ProjectAgentSettings from "../ProjectAgentSettings";
import PlanBanner from "../PlanBanner";
import Billing from "../../pages/Billing";
import api, { authAPI } from "../../services/api";
import { logout, setCredentials } from "../../store/slices/authSlice";
import type { BillingStatus, Timer } from "../../types/agent";
import type { Project } from "../../store/slices/projectsSlice";
import { act } from "react";

afterEach(() => {
  vi.restoreAllMocks();
});

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

const planStatus = (over: Partial<BillingStatus>): BillingStatus => ({
  billingEnabled: true,
  plan: "free",
  reason: "free",
  trialEndsAt: null,
  limits: { maxRunningAgentTimers: 2, historyDays: 14, shareLinks: false, aiCostLines: false },
  usage: { runningAgentTimers: 0 },
  subscription: null,
  canManage: false,
  prices: { month: { amount: 15, currency: "usd" }, year: { amount: 144, currency: "usd" } },
  ...over,
});
const signIn = (store: ReturnType<typeof configureStore>, id: string, token = `tok-${id}`) =>
  store.dispatch(setCredentials({ user: { id, name: id, email: `${id}@dev.test` }, token } as never));

describe("S6 review round 2", () => {
  it("the plan shown belongs to whoever is signed in now", async () => {
    const store = configureStore({ reducer: reducers });
    signIn(store, "alice");
    const status = vi
      .spyOn(api.billing, "status")
      .mockResolvedValueOnce(
        planStatus({ plan: "pro", reason: "subscription", canManage: true, subscription: { status: "active", interval: "year", currentPeriodEnd: null, cancelAtPeriodEnd: false } })
      )
      .mockResolvedValueOnce(planStatus({}));
    const { unmount } = renderWithProviders(<Billing />, { store });
    expect(await screen.findByText("Pro (yearly)")).toBeTruthy();
    unmount();
    act(() => {
      store.dispatch(logout());
    });
    signIn(store, "bob");
    renderWithProviders(<Billing />, { store });
    expect(await screen.findByText("Free plan")).toBeTruthy();
    expect(screen.queryByText("Pro (yearly)")).toBeNull();
    expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeTruthy();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("a failed refresh keeps the last known plan on screen", async () => {
    const store = configureStore({ reducer: reducers });
    signIn(store, "carol");
    vi.spyOn(api.billing, "status").mockResolvedValueOnce(planStatus({})).mockRejectedValue(new Error("Network Error"));
    const first = renderWithProviders(<Billing />, { store });
    expect(await screen.findByText("Free plan")).toBeTruthy();
    first.unmount();
    renderWithProviders(<Billing />, { store }); // refetches on mount, which fails
    expect(await screen.findByText(/Couldn't refresh your plan \(Network Error\)/)).toBeTruthy();
    expect(screen.getByText("Free plan")).toBeTruthy();
  });

  it("project settings send only what changed, so repos learned meanwhile survive", async () => {
    const project = {
      id: "p1",
      name: "Acme",
      repoPatterns: ["github.com/acme/web"],
      overlapMode: null,
      aiMultiplier: null,
      agentHourlyRate: null,
      includeAiCosts: false,
      aiCostMarkupPercent: 0,
    } as unknown as Project;
    vi.spyOn(api.projects, "getProject").mockResolvedValue(project);
    const put = vi.spyOn(api.projects, "updateProject").mockResolvedValue({ ...project, aiMultiplier: 2 } as Project);
    renderWithProviders(<ProjectAgentSettings project={project} />);
    const multiplier = await screen.findByPlaceholderText("Account default");
    await waitFor(() => expect(screen.getByRole("button", { name: /^save$/i }).hasAttribute("disabled")).toBe(false));
    fireEvent.change(multiplier, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("p1", { aiMultiplier: 2 }));
  });
});

describe("S6 review round 3", () => {
  it("signing back into the same account fetches the plan again", async () => {
    const store = configureStore({ reducer: reducers });
    signIn(store, "dave", "tok-1");
    const status = vi
      .spyOn(api.billing, "status")
      .mockResolvedValueOnce(planStatus({ reason: "trial", plan: "pro", trialEndsAt: new Date(Date.now() + 5 * 86400_000).toISOString() }))
      .mockResolvedValueOnce(planStatus({}));
    const first = renderWithProviders(<PlanBanner />, { store });
    expect(await screen.findByText(/Pro trial: 5 days left/)).toBeTruthy();
    first.unmount();
    act(() => {
      store.dispatch(logout());
    });
    signIn(store, "dave", "tok-2");
    renderWithProviders(<PlanBanner />, { store });
    expect(await screen.findByText(/Free plan: 2 agents at once/)).toBeTruthy();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("a repo edit is applied to the current list, keeping repos learned meanwhile", async () => {
    const project = {
      id: "p2",
      name: "Acme",
      repoPatterns: ["github.com/acme/web", "github.com/acme/old"],
      overlapMode: null,
      aiMultiplier: null,
      agentHourlyRate: null,
      includeAiCosts: false,
      aiCostMarkupPercent: 0,
    } as unknown as Project;
    const getProject = vi.spyOn(api.projects, "getProject").mockResolvedValueOnce(project);
    renderWithProviders(<ProjectAgentSettings project={project} />);
    const textarea = (await screen.findByDisplayValue(/github.com\/acme\/web/)) as HTMLTextAreaElement;
    await waitFor(() => expect(screen.getByRole("button", { name: /^save$/i }).hasAttribute("disabled")).toBe(false));
    // Meanwhile an agent's timer was assigned here and its repo learned.
    getProject.mockResolvedValueOnce({ ...project, repoPatterns: [...project.repoPatterns!, "github.com/acme/learned"] } as Project);
    const put = vi.spyOn(api.projects, "updateProject").mockImplementation(async (_id, body) => ({ ...project, ...body }) as Project);
    fireEvent.change(textarea, { target: { value: "github.com/acme/web\ngithub.com/acme/api" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("p2", { repoPatterns: ["github.com/acme/web", "github.com/acme/learned", "github.com/acme/api"] })
    );
  });
});

