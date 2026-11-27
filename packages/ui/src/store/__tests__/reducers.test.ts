import { describe, it, expect } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { reducers } from "../reducers";

describe("signing out", () => {
  it("starts every slice over, so the next account sees none of the last one's data", () => {
    const store = configureStore({ reducer: reducers });
    const fresh = store.getState();
    store.dispatch({ type: "auth/setCredentials", payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test" }, token: "t" } });
    store.dispatch({ type: "projects/fetchProjects/fulfilled", payload: [{ id: "p1", name: "Acme" }] });
    store.dispatch({ type: "timers/fetchActive/fulfilled", payload: [{ id: "tm1", description: "A's client work" }] });
    expect(store.getState().projects.projects).toHaveLength(1);
    expect(store.getState().timers.items).toHaveLength(1);

    store.dispatch({ type: "auth/logout" });
    const after = store.getState();
    for (const slice of Object.keys(fresh) as Array<keyof typeof fresh>) {
      if (slice === "auth") continue;
      expect(after[slice]).toEqual(fresh[slice]);
    }
    expect(after.auth).toMatchObject({ user: null, token: null, isAuthenticated: false });
  });
});
