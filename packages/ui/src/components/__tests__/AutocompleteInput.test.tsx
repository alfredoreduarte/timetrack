import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AutocompleteInput from "../AutocompleteInput";
import { renderWithProviders, createMockStore } from "../../test/utils";
import { server } from "../../test/mocks/server";
import { http, HttpResponse } from "msw";

const mockSuggestions = [
  {
    description: "Code review - PR #142",
    frequency: 12,
    lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    project: { id: "project-1", name: "TimeTrack", color: "#3B82F6" },
    task: { id: "task-1", name: "Reviews" },
  },
  {
    description: "Code cleanup and refactoring",
    frequency: 5,
    lastUsed: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1d ago
    project: { id: "project-1", name: "TimeTrack", color: "#3B82F6" },
    task: null,
  },
  {
    description: "Sprint planning",
    frequency: 8,
    lastUsed: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3d ago
    project: { id: "project-2", name: "Landing Page", color: "#10B981" },
    task: null,
  },
];

describe("AutocompleteInput", () => {
  let onChangeMock: ReturnType<typeof vi.fn>;
  let onSelectMock: ReturnType<typeof vi.fn>;
  let onKeyDownMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChangeMock = vi.fn();
    onSelectMock = vi.fn();
    onKeyDownMock = vi.fn();

    // Set up MSW handler for suggestions
    server.use(
      http.get("http://localhost:3011/time-entries/suggestions", ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q") || "";
        const filtered = mockSuggestions.filter((s) =>
          s.description.toLowerCase().includes(q.toLowerCase())
        );
        return HttpResponse.json({ suggestions: filtered });
      })
    );
  });

  it("should render input with placeholder", () => {
    const store = createMockStore();
    renderWithProviders(
      <AutocompleteInput
        value=""
        onChange={onChangeMock}
        placeholder="What are you working on?"
      />,
      { store }
    );

    const input = screen.getByPlaceholderText("What are you working on?");
    expect(input).toBeInTheDocument();
  });

  it("should have correct ARIA attributes", () => {
    const store = createMockStore();
    renderWithProviders(
      <AutocompleteInput
        value=""
        onChange={onChangeMock}
        id="description"
      />,
      { store }
    );

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-haspopup", "listbox");
    expect(input).toHaveAttribute("autocomplete", "off");
  });

  it("should show dropdown when typing 2+ chars with matches", async () => {
    const store = createMockStore();

    const { rerender } = renderWithProviders(
      <AutocompleteInput
        value=""
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    // Simulate typing "co"
    rerender(
      <AutocompleteInput
        value="co"
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />
    );

    await waitFor(() => {
      const listbox = screen.getByRole("listbox");
      expect(listbox).toBeInTheDocument();
    });
  });

  it("should not show dropdown when input has less than 2 chars", () => {
    const store = createMockStore();
    renderWithProviders(
      <AutocompleteInput
        value="c"
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("should navigate suggestions with ArrowDown", async () => {
    const user = userEvent.setup();
    const store = createMockStore();

    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}");

    await waitFor(() => {
      const firstOption = screen.getAllByRole("option")[0];
      expect(firstOption).toHaveAttribute("aria-selected", "true");
    });
  });

  it("should navigate suggestions with ArrowUp (wraps to last)", async () => {
    const user = userEvent.setup();
    const store = createMockStore();

    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const input = screen.getByRole("combobox");
    await user.click(input);

    // ArrowDown to highlight first, then ArrowUp to wrap to last
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");

    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const lastOption = options[options.length - 1];
      expect(lastOption).toHaveAttribute("aria-selected", "true");
    });
  });

  it("should select suggestion with Enter when highlighted", async () => {
    const user = userEvent.setup();
    const store = createMockStore();

    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        onSelect={onSelectMock}
        onKeyDown={onKeyDownMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    // onChange should be called with the suggestion description
    expect(onChangeMock).toHaveBeenCalledWith("Code review - PR #142");
    // onSelect should be called with full suggestion object
    expect(onSelectMock).toHaveBeenCalled();
    // onKeyDown should NOT have been called (Enter was intercepted)
    expect(onKeyDownMock).not.toHaveBeenCalled();
  });

  it("should pass Enter through when no suggestion is highlighted", async () => {
    const user = userEvent.setup();
    const store = createMockStore();

    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        onKeyDown={onKeyDownMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{Enter}");

    // onKeyDown should be called because nothing was highlighted
    expect(onKeyDownMock).toHaveBeenCalled();
  });

  it("should close dropdown on Escape", async () => {
    const user = userEvent.setup();
    const store = createMockStore();

    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("should select suggestion on click", async () => {
    const user = userEvent.setup();
    const store = createMockStore();

    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        onSelect={onSelectMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const options = screen.getAllByRole("option");
    await user.click(options[0]);

    expect(onChangeMock).toHaveBeenCalledWith("Code review - PR #142");
    expect(onSelectMock).toHaveBeenCalled();
  });

  it("should show empty state when no matches", async () => {
    server.use(
      http.get("http://localhost:3011/time-entries/suggestions", () => {
        return HttpResponse.json({ suggestions: [] });
      })
    );

    const store = createMockStore();
    renderWithProviders(
      <AutocompleteInput
        value="xyzzy_nonexistent"
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByText("No matching descriptions found")).toBeInTheDocument();
    });
  });

  it("should not open dropdown when disabled", () => {
    const store = createMockStore();
    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        id="description"
        disabled={true}
        debounceMs={0}
      />,
      { store }
    );

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("should display project and task info in suggestions", async () => {
    const store = createMockStore();
    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    // Check project name is displayed
    expect(screen.getAllByText("TimeTrack").length).toBeGreaterThan(0);
    // Check task name is displayed
    expect(screen.getByText("Reviews")).toBeInTheDocument();
    // Check frequency badge
    expect(screen.getByText("12x")).toBeInTheDocument();
  });

  it("should display screen reader announcement when suggestions appear", async () => {
    const store = createMockStore();
    renderWithProviders(
      <AutocompleteInput
        value="code"
        onChange={onChangeMock}
        id="description"
        debounceMs={0}
      />,
      { store }
    );

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    // Check the live region has content
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.textContent).toContain("available");
  });
});
