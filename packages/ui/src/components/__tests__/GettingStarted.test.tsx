import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { http, HttpResponse } from "msw";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { server, apiPath } from "../../test/mocks/server";
import { markTimesheetSent } from "../../utils/onboarding";
import GettingStarted from "../GettingStarted";

function storeFor(user: Record<string, unknown>, projects: Array<Record<string, unknown>> = []) {
  const store = configureStore({ reducer: reducers });
  store.dispatch({ type: "auth/setCredentials", payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test", ...user }, token: "t" } });
  store.dispatch({ type: "projects/fetchProjects/fulfilled", payload: projects });
  return store;
}

/** Answers the checklist's two requests, counting them. */
function respond(keys: number, links: number) {
  const calls = { count: 0 };
  server.use(
    http.get(apiPath("/api-keys"), () => {
      calls.count++;
      return HttpResponse.json({ apiKeys: Array.from({ length: keys }, (_, i) => ({ id: `k${i}` })) });
    }),
    http.get(apiPath("/share-links"), () => {
      calls.count++;
      return HttpResponse.json({ shareLinks: Array.from({ length: links }, (_, i) => ({ id: `s${i}` })) });
    })
  );
  return calls;
}

beforeEach(() => {
  localStorage.clear();
});

describe("GettingStarted", () => {
  it("lists the steps a new account still has to do", async () => {
    respond(0, 0);
    renderWithProviders(<GettingStarted />, { store: storeFor({ defaultHourlyRate: null }) });
    expect(await screen.findByText("0 of 4 done")).toBeInTheDocument();
    for (const step of ["Connect Claude Code", "Add a client project", "Set your rate", "Send a timesheet"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText("Connect Claude Code").closest("a")).toHaveAttribute("href", "/integrations");
    expect(screen.getAllByText("To do:")).toHaveLength(4);
  });

  it("waits for the project list before showing anything", async () => {
    respond(0, 0);
    const store = configureStore({ reducer: reducers });
    store.dispatch({ type: "auth/setCredentials", payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test" }, token: "t" } });
    renderWithProviders(<GettingStarted />, { store });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Get set up")).not.toBeInTheDocument();
    store.dispatch({ type: "projects/fetchProjects/fulfilled", payload: [] });
    expect(await screen.findByText("0 of 4 done")).toBeInTheDocument();
  });

  it("checks off what's done, counts a CSV or Markdown export, and hides itself for good when finished", async () => {
    respond(1, 0);
    const store = storeFor({ defaultHourlyRate: 90 }, [{ id: "p1", name: "Acme", hourlyRate: null }]);
    const first = renderWithProviders(<GettingStarted />, { store });
    expect(await screen.findByText("3 of 4 done")).toBeInTheDocument();
    expect(screen.getAllByText("Done:")).toHaveLength(3);
    first.unmount();

    // A Free account sends its timesheet as CSV (no share links).
    markTimesheetSent("u1");
    const calls = respond(1, 0);
    const second = renderWithProviders(<GettingStarted />, { store });
    await waitFor(() => expect(calls.count).toBe(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Get set up")).not.toBeInTheDocument();
    second.unmount();

    // Remembered: the next visit doesn't even ask.
    const later = respond(1, 0);
    renderWithProviders(<GettingStarted />, { store });
    await new Promise((r) => setTimeout(r, 50));
    expect(later.count).toBe(0);
    expect(screen.queryByText("Get set up")).not.toBeInTheDocument();
  });

  it("stays hidden once dismissed", async () => {
    respond(0, 0);
    const store = storeFor({ defaultHourlyRate: null });
    const { unmount } = renderWithProviders(<GettingStarted />, { store });
    fireEvent.click(await screen.findByRole("button", { name: "Hide the setup checklist" }));
    expect(screen.queryByText("Get set up")).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<GettingStarted />, { store });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Get set up")).not.toBeInTheDocument();
  });
});
