import { describe, it, expect } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { http, HttpResponse, delay } from "msw";
import { server, apiPath } from "../../test/mocks/server";
import { reducers } from "../reducers";
import { sessionGuard } from "../sessionGuard";
import { fetchProjects } from "../slices/projectsSlice";
import { logout } from "../slices/authSlice";

const storeWithGuard = () =>
  configureStore({ reducer: reducers, middleware: (getDefault) => getDefault().concat(sessionGuard) });

const A_PROJECTS = [{ id: "pA", name: "A's client" }] as never;

describe("sessionGuard", () => {
  it("drops the answer to a request sent before signing out", () => {
    const store = storeWithGuard();
    store.dispatch(fetchProjects.pending("r1", undefined));
    store.dispatch(logout());
    store.dispatch(fetchProjects.fulfilled(A_PROJECTS, "r1", undefined));
    expect(store.getState().projects).toMatchObject({ projects: [], loaded: false });
  });

  it("keeps answers to requests sent in the current session", () => {
    const store = storeWithGuard();
    store.dispatch(logout());
    store.dispatch(fetchProjects.pending("r2", undefined));
    store.dispatch(fetchProjects.fulfilled(A_PROJECTS, "r2", undefined));
    expect(store.getState().projects).toMatchObject({ projects: [{ id: "pA" }], loaded: true });
  });

  it("drops a late failure too, and lets actions without a request id through", () => {
    const store = storeWithGuard();
    store.dispatch(fetchProjects.pending("r3", undefined));
    store.dispatch(logout());
    store.dispatch(fetchProjects.rejected(new Error("boom"), "r3", undefined));
    expect(store.getState().projects.error).toBeNull();
    store.dispatch({ type: "projects/fetchProjects/fulfilled", payload: A_PROJECTS });
    expect(store.getState().projects.loaded).toBe(true);
  });

  it("end to end: a slow project list for the last account doesn't reach the next one", async () => {
    server.use(
      http.get(apiPath("/projects"), async () => {
        await delay(50);
        return HttpResponse.json({ projects: [{ id: "pA", name: "A's client" }] });
      })
    );
    const store = storeWithGuard();
    store.dispatch({ type: "auth/setCredentials", payload: { user: { id: "uA", name: "A", email: "a@dev.test" }, token: "tA" } });
    const inFlight = store.dispatch(fetchProjects());
    store.dispatch(logout());
    await inFlight;
    expect(store.getState().projects).toMatchObject({ projects: [], loaded: false });
  });
});
