import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEditStore } from "./editStore";
import type { PipelineDef, NodeDef, EdgeDef } from "../types";

vi.mock("../api", () => ({
  fetchPipelines: vi.fn(),
  fetchPipeline: vi.fn(),
  fetchRunPipeline: vi.fn(),
  savePipeline: vi.fn().mockResolvedValue(undefined),
  saveRunPipeline: vi.fn().mockResolvedValue(undefined),
}));

function makePipeline(
  nodes: NodeDef[] = [],
  edges: EdgeDef[] = [],
): PipelineDef {
  return { name: "test", version: "1.0", variables: {}, nodes, edges };
}

function makeNode(overrides: Partial<NodeDef> = {}): NodeDef {
  return {
    id: "default",
    name: "Default",
    type: "doc-only",
    inputs: [{ name: "in", repeated: false }],
    outputs: [{ name: "out", repeated: false }],
    interactive: false,
    view: { x: 100, y: 100 },
    ...overrides,
  };
}

function seedTab(pipeline: PipelineDef) {
  useEditStore.setState({
    openTabs: [
      {
        id: "test-tab",
        scope: "repo",
        pipeline,
        prompts: {},
        dirty: false,
        externalDirty: false,
      },
    ],
    activeTabId: "test-tab",
    selection: { kind: "none", id: null },
  });
}

beforeEach(() => {
  useEditStore.setState({
    pipelines: [],
    openTabs: [],
    activeTabId: null,
    selection: { kind: "none", id: null },
  });
});

describe("addNode", () => {
  it("adds a node to the active pipeline", () => {
    seedTab(makePipeline());

    const node = makeNode({ id: "abc12345", name: "worker" });
    useEditStore.getState().addNode(node);

    const tab = useEditStore.getState().openTabs[0];
    expect(tab.pipeline.nodes).toHaveLength(1);
    expect(tab.pipeline.nodes[0].id).toBe("abc12345");
    expect(tab.pipeline.nodes[0].name).toBe("worker");
  });
});

describe("duplicateNode", () => {
  it("generates a new id different from the original", () => {
    const original = makeNode({ id: "orig1234", name: "my-node" });
    seedTab(makePipeline([original]));

    useEditStore.getState().duplicateNode("orig1234");

    const tab = useEditStore.getState().openTabs[0];
    expect(tab.pipeline.nodes).toHaveLength(2);
    const dup = tab.pipeline.nodes[1];
    expect(dup.id).not.toBe("orig1234");
    expect(dup.id).toHaveLength(8);
    expect(dup.name).toBe("my-node copy");
  });

  it("generates unique ids across multiple duplications", () => {
    const original = makeNode({ id: "orig1234", name: "worker" });
    seedTab(makePipeline([original]));

    useEditStore.getState().duplicateNode("orig1234");
    useEditStore.getState().duplicateNode("orig1234");

    const tab = useEditStore.getState().openTabs[0];
    const ids = tab.pipeline.nodes.map((n) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });
});

describe("updateNode with name", () => {
  it("updates node name without affecting edges", () => {
    const nodeA = makeNode({ id: "aaaaaaaa", name: "Alpha" });
    const nodeB = makeNode({ id: "bbbbbbbb", name: "Beta" });
    const edge: EdgeDef = {
      source: { node: "aaaaaaaa", port: "out" },
      target: { node: "bbbbbbbb", port: "in" },
    };
    seedTab(makePipeline([nodeA, nodeB], [edge]));

    useEditStore.getState().updateNode("aaaaaaaa", { name: "Renamed" });

    const tab = useEditStore.getState().openTabs[0];
    expect(tab.pipeline.nodes[0].name).toBe("Renamed");
    expect(tab.pipeline.edges[0].source.node).toBe("aaaaaaaa");
    expect(tab.pipeline.edges[0].target).toEqual({ node: "bbbbbbbb", port: "in" });
  });

  it("does not cascade name changes to edges", () => {
    const node = makeNode({ id: "cccccccc", name: "Original" });
    const edge: EdgeDef = {
      source: { node: "cccccccc", port: "out" },
      target: { halt: { message: "done" } },
    };
    seedTab(makePipeline([node], [edge]));

    useEditStore.getState().updateNode("cccccccc", { name: "New Name" });

    const tab = useEditStore.getState().openTabs[0];
    expect(tab.pipeline.edges[0].source.node).toBe("cccccccc");
  });
});
