import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { http, HttpResponse } from "msw";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { server, apiPath } from "../../test/mocks/server";
import GettingStarted from "../GettingStarted";

function storeFor(user: Record<string, unknown>, projects: Array<Record<string, unknown>> = []) {
  const store = configureStore({ reducer: reducers });
  store.dispatch({ type: "auth/setCredentials", payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test", ...user }, token: "t" } });
  store.dispatch({ type: "projects/fetchProjects/fulfilled", payload: projects });
  return store;
}

beforeEach(() => {
  localStorage.clear();
});

describe("GettingStarted", () => {
  it("lists the steps a new account still has to do", async () => {
    renderWithProviders(<GettingStarted />, { store: storeFor({ defaultHourlyRate: null }) });
    expect(await screen.findByText("0 of 4 done")).toBeInTheDocument();
    for (const step of ["Connect Claude Code", "Add a client project", "Set your rate", "Send a timesheet"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText("Connect Claude Code").closest("a")).toHaveAttribute("href", "/integrations");
  });

  it("checks off what's done and disappears when everything is", async () => {
    server.use(http.get(apiPath("/api-keys"), () => HttpResponse.json({ apiKeys: [{ id: "k1" }] })));
    const store = storeFor({ defaultHourlyRate: 90 }, [{ id: "p1", name: "Acme", hourlyRate: null }]);
    const { unmount } = renderWithProviders(<GettingStarted />, { store });
    expect(await screen.findByText("3 of 4 done")).toBeInTheDocument();
    unmount();

    server.use(
      http.get(apiPath("/api-keys"), () => HttpResponse.json({ apiKeys: [{ id: "k1" }] })),
      http.get(apiPath("/share-links"), () => HttpResponse.json({ shareLinks: [{ id: "s1" }] }))
    );
    renderWithProviders(<GettingStarted />, { store });
    await waitFor(() => expect(screen.queryByText("Get set up")).not.toBeInTheDocument());
  });

  it("stays hidden once dismissed", async () => {
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
