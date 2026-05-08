import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LibraryDropdown from "./LibraryDropdown";
import type { LibraryEntry } from "../api";
import { useEditStore } from "../stores/editStore";

vi.mock("../api", () => ({
  fetchLibrary: vi.fn().mockResolvedValue([]),
  saveToLibrary: vi.fn().mockResolvedValue({}),
  deleteFromLibrary: vi.fn().mockResolvedValue(undefined),
  instantiateFromLibrary: vi.fn().mockResolvedValue({
    spec: {
      name: "Test",
      type: "doc-only",
      inputs: [],
      outputs: [],
      interactive: false,
    },
    prompt: "test prompt",
  }),
}));

vi.mock("../lib/nanoid", () => ({
  generateNodeId: () => "mock-id",
}));

function makeEntry(name: string, prompt = "Some prompt"): LibraryEntry {
  return {
    name,
    type: "doc-only",
    inputs: [{ name: "in", repeated: false }],
    outputs: [{ name: "out", repeated: false }],
    interactive: false,
    prompt,
  };
}

beforeEach(() => {
  useEditStore.setState({
    openTabs: [
      {
        id: "test-tab",
        scope: "repo",
        pipeline: {
          name: "test",
          version: "1.0",
          variables: {},
          nodes: [],
          edges: [],
        },
        prompts: {},
        dirty: false,
        externalDirty: false,
      },
    ],
    activeTabId: "test-tab",
    selection: { kind: "none", id: null },
  });
});

describe("LibraryDropdown", () => {
  it("renders the library button", () => {
    render(<LibraryDropdown entries={[]} onDelete={vi.fn()} />);
    expect(screen.getByTitle("Library")).toBeInTheDocument();
  });

  it("shows empty state when no entries and dropdown opened", () => {
    render(<LibraryDropdown entries={[]} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Library"));
    expect(screen.getByText(/No saved nodes yet/)).toBeInTheDocument();
  });

  it("shows entries when dropdown is opened", () => {
    const entries = [makeEntry("Alpha"), makeEntry("Beta")];
    render(<LibraryDropdown entries={entries} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Library"));
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("filters entries by search", () => {
    const entries = [makeEntry("Reviewer"), makeEntry("Implementer")];
    render(<LibraryDropdown entries={entries} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Library"));
    const searchInput = screen.getByPlaceholderText("Search nodes...");
    fireEvent.change(searchInput, { target: { value: "review" } });
    expect(screen.getByText("Reviewer")).toBeInTheDocument();
    expect(screen.queryByText("Implementer")).not.toBeInTheDocument();
  });

  it("shows entry count in header", () => {
    const entries = [makeEntry("A"), makeEntry("B"), makeEntry("C")];
    render(<LibraryDropdown entries={entries} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Library"));
    expect(screen.getByText("3 entries")).toBeInTheDocument();
  });

  it("shows singular count for 1 entry", () => {
    const entries = [makeEntry("Solo")];
    render(<LibraryDropdown entries={entries} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Library"));
    expect(screen.getByText("1 entry")).toBeInTheDocument();
  });

  it("shows prompt preview truncated to 60 chars", () => {
    const longPrompt = "A".repeat(80);
    const entries = [makeEntry("Node", longPrompt)];
    render(<LibraryDropdown entries={entries} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Library"));
    expect(screen.getByText("A".repeat(60))).toBeInTheDocument();
  });
});
