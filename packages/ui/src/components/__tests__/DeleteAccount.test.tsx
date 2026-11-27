import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { http, HttpResponse } from "msw";
import { Routes, Route } from "react-router-dom";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { server, apiPath } from "../../test/mocks/server";
import DeleteAccount from "../DeleteAccount";

function signedIn() {
  const store = configureStore({ reducer: reducers });
  store.dispatch({ type: "auth/setCredentials", payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test" }, token: "t" } });
  return store;
}

function renderPage(store: ReturnType<typeof signedIn>) {
  window.history.pushState({}, "", "/settings");
  return renderWithProviders(
    <Routes>
      <Route path="/settings" element={<DeleteAccount />} />
      <Route path="/login" element={<p>Login page</p>} />
    </Routes>,
    { store }
  );
}

describe("DeleteAccount", () => {
  it("shows the server's message when the password is wrong, and keeps the user signed in", async () => {
    server.use(http.delete(apiPath("/users/me"), () => HttpResponse.json({ error: "Password is incorrect" }, { status: 400 })));
    const store = signedIn();
    renderPage(store);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    fireEvent.change(screen.getByLabelText("Your password, to confirm"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect");
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it("signs out and goes to the login page once the account is deleted", async () => {
    let body: unknown = null;
    server.use(
      http.delete(apiPath("/users/me"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ deleted: true });
      })
    );
    const store = signedIn();
    renderPage(store);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    fireEvent.change(screen.getByLabelText("Your password, to confirm"), { target: { value: "right one" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(body).toEqual({ password: "right one" });
    await waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(false));
    expect(localStorage.getItem("token")).toBeNull();
  });
});
