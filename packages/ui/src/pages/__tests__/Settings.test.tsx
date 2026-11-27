import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import Settings from "../Settings";

describe("Settings", () => {
  it("labels the default rate with the user's currency, with no dollar sign", () => {
    const store = configureStore({ reducer: reducers });
    store.dispatch({
      type: "auth/setCredentials",
      payload: { user: { id: "u1", name: "Ada", email: "ada@dev.test", defaultHourlyRate: 80, currency: "EUR" }, token: "t" },
    });
    renderWithProviders(<Settings />, { store });

    expect(screen.getByText("Default Hourly Rate (EUR)")).toBeTruthy();
    const rate = document.querySelector('input[name="defaultHourlyRate"]') as HTMLInputElement;
    expect(rate.value).toBe("80");
    expect(rate.parentElement?.textContent ?? "").not.toContain("$");
  });
});
