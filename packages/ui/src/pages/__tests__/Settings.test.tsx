import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { http, HttpResponse } from "msw";
import { reducers } from "../../store/reducers";
import { renderWithProviders } from "../../test/utils";
import { server, apiPath } from "../../test/mocks/server";
import Settings from "../Settings";

describe("Settings", () => {
  it("labels the default rate with the user's currency, with no dollar sign", async () => {
    server.use(http.get(apiPath("/api-keys"), () => HttpResponse.json({ apiKeys: [] })));
    const store = configureStore({ reducer: reducers });
    store.dispatch({
      type: "auth/setCredentials",
      // A full profile, so the billing settings don't refetch it.
      payload: {
        user: { id: "u1", name: "Ada", email: "ada@dev.test", defaultHourlyRate: 80, currency: "EUR", overlapMode: "dedupe", agentIdleTimeoutSeconds: 900 },
        token: "t",
      },
    });
    renderWithProviders(<Settings />, { store });

    expect(screen.getByText("Default Hourly Rate (EUR)")).toBeTruthy();
    const rate = document.querySelector('input[name="defaultHourlyRate"]') as HTMLInputElement;
    expect(rate.value).toBe("80");
    expect(rate.parentElement?.textContent ?? "").not.toContain("$");
    // Let the page's requests settle, so an unmocked one fails the test.
    expect(await screen.findByText(/No API keys yet/)).toBeTruthy();
  });
});
