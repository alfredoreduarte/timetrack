import { describe, it, expect, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { http, HttpResponse, delay } from "msw";
import { server, apiPath } from "../../test/mocks/server";
import { reducers } from "../reducers";
import { sessionGuard } from "../sessionGuard";
import { fetchProjects } from "../slices/projectsSlice";
import { logout, getCurrentUser, updateProfile } from "../slices/authSlice";

const storeWithGuard = () =>
  configureStore({ reducer: reducers, middleware: (getDefault) => getDefault().concat(sessionGuard) });

const A_PROJECTS = [{ id: "pA", name: "A's client" }] as never;

beforeEach(() => localStorage.clear());

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

  const ALICE = { id: "uA", name: "Alice", email: "alice@dev.test" };
  const BOB = { id: "uB", name: "Bob", email: "bob@dev.test" };
  const slowProfile = () =>
    server.use(
      http.get(apiPath("/auth/me"), async () => {
        await delay(50);
        return HttpResponse.json({ user: ALICE });
      }),
      http.put(apiPath("/users/profile"), async () => {
        await delay(50);
        return HttpResponse.json({ message: "ok", user: ALICE });
      })
    );

  it("a late profile answer doesn't put the last account back in browser storage", async () => {
    slowProfile();
    const store = storeWithGuard();
    store.dispatch({ type: "auth/setCredentials", payload: { user: ALICE, token: "tA" } });
    const pending = [store.dispatch(getCurrentUser()), store.dispatch(updateProfile({ name: "Alice" }))];
    store.dispatch(logout());
    await Promise.all(pending);
    expect(store.getState().auth.user).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("...nor pair the next account's token with the last one's profile", async () => {
    slowProfile();
    const store = storeWithGuard();
    store.dispatch({ type: "auth/setCredentials", payload: { user: ALICE, token: "tA" } });
    const late = store.dispatch(getCurrentUser());
    store.dispatch(logout());
    store.dispatch({ type: "auth/setCredentials", payload: { user: BOB, token: "tB" } });
    await late;
    expect(store.getState().auth.user).toMatchObject({ id: "uB" });
    expect(JSON.parse(localStorage.getItem("user") ?? "null")).toMatchObject({ id: "uB" });
    expect(localStorage.getItem("token")).toBe("tB");
  });

  it("a current answer still saves the profile", async () => {
    slowProfile();
    const store = storeWithGuard();
    store.dispatch({ type: "auth/setCredentials", payload: { user: { ...ALICE, name: "Old" }, token: "tA" } });
    await store.dispatch(getCurrentUser());
    expect(JSON.parse(localStorage.getItem("user") ?? "null")).toMatchObject({ id: "uA", name: "Alice" });
  });
});
