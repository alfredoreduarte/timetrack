import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, getDefaultNormalizer } from "@testing-library/react";
import { renderWithProviders, createMockStore } from "../../test/utils";
import { projectsAPI, tasksAPI } from "../../services/api";
import { money } from "../../utils/agentFormat";
import Projects from "../Projects";

afterEach(() => {
  vi.restoreAllMocks();
});

// Amounts are formatted in the runner's locale; match them as rendered.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };

describe("Projects", () => {
  it("shows rates in the user's currency", async () => {
    const project = {
      id: "project-1",
      name: "Acme",
      description: null,
      color: "#3B82F6",
      isActive: true,
      hourlyRate: 50,
      userId: "user-1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    vi.spyOn(projectsAPI, "getProjects").mockResolvedValue([project] as never);
    vi.spyOn(tasksAPI, "getTasks").mockResolvedValue([] as never);
    const store = createMockStore();
    store.dispatch({
      type: "auth/setCredentials",
      payload: { user: { id: "user-1", email: "test@example.com", name: "Test User", currency: "EUR" }, token: "t" },
    });
    renderWithProviders(<Projects />, { store });

    expect(await screen.findByText(`${money(50, "EUR")}/hr`, exact)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /new project/i })[0]);
    expect(screen.getByText("Hourly Rate (EUR)")).toBeInTheDocument();
  });
});
