import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    ReactFlow: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "reactflow" }, children),
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    Background: () => null,
    Handle: () => null,
    Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
    MarkerType: { ArrowClosed: "arrowclosed" },
    useNodesState: () => [[], vi.fn(), vi.fn()],
    useEdgesState: () => [[], vi.fn(), vi.fn()],
  };
});

vi.mock("../api", () => ({
  cleanupRun: vi.fn().mockResolvedValue(undefined),
  attachManager: vi.fn().mockResolvedValue(undefined),
  fetchRunPipeline: vi.fn().mockResolvedValue({ id: "p", scope: "repo", path: "/p", yaml: "", pipeline: { name: "p", nodes: [], edges: [], variables: {} }, prompts: {}, diagnostics: [] }),
  saveRunPipeline: vi.fn().mockResolvedValue(undefined),
  pauseRun: vi.fn().mockResolvedValue(undefined),
  resumeRun: vi.fn().mockResolvedValue(undefined),
  retryAll: vi.fn().mockResolvedValue({ run_id: "new-run" }),
}));

import DagCanvas from "./DagCanvas";
import { TooltipProvider } from "./ui/tooltip";
import type { RunState, RunStatus } from "../types";

function makeRun(status: RunStatus, extra?: Partial<RunState>): RunState {
  return {
    run_id: "run-1",
    pipeline_name: "test-pipe",
    status,
    input: "do the thing",
    started_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    nodes: {
      a: {
        node_id: "a",
        status: "completed",
        iter: 1,
        started_at: "t0",
        completed_at: "t1",
        failure_reason: null,
        iterations: [{ iter: 1, status: "completed", started_at: "t0", completed_at: "t1" }],
      },
    },
    edges: [],
    node_defs: [
      { id: "a", name: "a", node_type: "doc-only", view_x: 100, view_y: 100, inputs: [], outputs: [] },
    ],
    start_node: null,
    end_node: null,
    merge_resolver: null,
    ...extra,
  };
}

function renderCanvas(status: RunStatus) {
  return render(
    <TooltipProvider>
      <DagCanvas
        run={makeRun(status)}
        onSelectNode={() => {}}
        selectedNodeId={null}
        onRetryAll={() => {}}
      />
    </TooltipProvider>,
  );
}

describe("DagCanvas run overlay button visibility", () => {
  it("shows Pause button when run is running", () => {
    renderCanvas("running");
    expect(screen.getByTestId("btn-pause")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-resume")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-retry-all")).not.toBeInTheDocument();
  });

  it("shows Pause button when run is awaiting_user", () => {
    renderCanvas("awaiting_user");
    expect(screen.getByTestId("btn-pause")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-resume")).not.toBeInTheDocument();
  });

  it("shows Resume button when run is paused", () => {
    renderCanvas("paused");
    expect(screen.getByTestId("btn-resume")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-pause")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-retry-all")).not.toBeInTheDocument();
  });

  it("shows Retry All button when run is completed", () => {
    renderCanvas("completed");
    expect(screen.getByTestId("btn-retry-all")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-pause")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-resume")).not.toBeInTheDocument();
  });

  it("shows Retry All button when run is failed", () => {
    renderCanvas("failed");
    expect(screen.getByTestId("btn-retry-all")).toBeInTheDocument();
  });

  it("shows Retry All button when run is halted", () => {
    renderCanvas("halted");
    expect(screen.getByTestId("btn-retry-all")).toBeInTheDocument();
  });

  it("hides all action buttons when run is archived", () => {
    renderCanvas("archived");
    expect(screen.queryByTestId("btn-pause")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-resume")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-retry-all")).not.toBeInTheDocument();
  });
});
