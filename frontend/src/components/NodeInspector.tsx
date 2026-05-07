import { useState, useRef } from "react";
import { useEditStore } from "../stores/editStore";
import type { NodeDef, NodeType, PortDef, PortSide } from "../types";
import { SectionHead, Field } from "./InspectorPrimitives";

export default function NodeInspector() {
  const openTabs = useEditStore((s) => s.openTabs);
  const activeTabId = useEditStore((s) => s.activeTabId);
  const selection = useEditStore((s) => s.selection);
  const updateNode = useEditStore((s) => s.updateNode);
  const updatePrompt = useEditStore((s) => s.updatePrompt);

  const tab = openTabs.find((t) => t.id === activeTabId);
  if (!tab || selection.kind !== "node" || !selection.id) return null;

  const node = tab.pipeline.nodes.find((n) => n.id === selection.id);
  if (!node) return null;

  const promptContent = tab.prompts[node.id] ?? "";

  function handleField(field: keyof NodeDef, value: unknown) {
    updateNode(node!.id, { [field]: value } as Partial<NodeDef>);
  }

  function handleAddPort(portSide: "inputs" | "outputs") {
    const ports = [...node![portSide]];
    let name = portSide === "inputs" ? "in" : "out";
    let counter = 1;
    while (ports.some((p) => p.name === name)) {
      name = `${portSide === "inputs" ? "in" : "out"}-${++counter}`;
    }
    const defaultSide: PortSide = portSide === "inputs" ? "left" : "right";
    ports.push({ name, repeated: false, side: defaultSide });
    updateNode(node!.id, { [portSide]: ports });
  }

  function handleUpdatePort(side: "inputs" | "outputs", index: number, updates: Partial<PortDef>) {
    const ports = node![side].map((p, i) => (i === index ? { ...p, ...updates } : p));
    updateNode(node!.id, { [side]: ports });
  }

  function handleRemovePort(side: "inputs" | "outputs", index: number) {
    const ports = node![side].filter((_, i) => i !== index);
    updateNode(node!.id, { [side]: ports });
  }

  return (
    <aside className="flex h-full flex-col bg-bg-2 overflow-y-auto">
      <div
        className="flex h-[36px] items-center border-b border-line px-3 font-medium text-fg-2"
        style={{ fontSize: "11.5px" }}
      >
        Node Inspector
      </div>

      <div className="flex flex-col gap-3 p-3" style={{ fontSize: "11.5px" }}>
        {/* Identity */}
        <SectionHead title="Identity" />
        <Field label="ID">
          <span
            className="block w-full cursor-pointer select-all rounded border border-line bg-bg-3 px-2 py-1 font-mono text-fg-3"
            style={{ fontSize: "10px" }}
            title="Click to copy"
            onClick={() => navigator.clipboard.writeText(node.id)}
          >
            {node.id}
          </span>
        </Field>
        <Field label="Name">
          <NameInput
            key={node.id}
            value={node.name ?? ""}
            placeholder={node.id}
            onCommit={(v) => handleField("name", v || null)}
          />
        </Field>

        {/* Type */}
        <SectionHead title="Type" />
        <div className="flex gap-1">
          {(["code-mutating", "doc-only"] as NodeType[]).map((t) => (
            <button
              key={t}
              onClick={() => handleField("type", t)}
              className={`flex-1 rounded border px-2 py-1 font-medium transition-colors ${
                node.type === t
                  ? t === "code-mutating"
                    ? "border-acc bg-acc-bg text-acc"
                    : "border-fg-4 bg-bg-3 text-fg"
                  : "border-line-strong bg-bg-3 text-fg-4 hover:text-fg-3"
              }`}
              style={{ fontSize: "10px" }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Behavior */}
        <SectionHead title="Behavior" />
        <div className="flex items-center justify-between">
          <span className="text-fg-3">Interactive</span>
          <button
            onClick={() => handleField("interactive", !node.interactive)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              node.interactive ? "bg-acc" : "bg-bg-5"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-fg transition-transform ${
                node.interactive ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Prompt */}
        <SectionHead title="Prompt" />
        <textarea
          value={promptContent}
          onChange={(e) => updatePrompt(node.id, e.target.value)}
          className="min-h-[120px] w-full resize-y rounded border border-line-strong bg-bg-3 px-2 py-1.5 font-mono text-fg outline-none focus:border-acc"
          style={{ fontSize: "11px", lineHeight: "1.5" }}
          placeholder="Enter the node's role prompt..."
        />

        {/* Inputs */}
        <SectionHead title="Inputs" count={node.inputs.length} onAdd={() => handleAddPort("inputs")} />
        {node.inputs.map((port, i) => (
          <PortRow
            key={i}
            port={port}
            onUpdate={(updates) => handleUpdatePort("inputs", i, updates)}
            onRemove={() => handleRemovePort("inputs", i)}
          />
        ))}

        {/* Outputs */}
        <SectionHead title="Outputs" count={node.outputs.length} onAdd={() => handleAddPort("outputs")} />
        {node.outputs.map((port, i) => (
          <PortRow
            key={i}
            port={port}
            onUpdate={(updates) => handleUpdatePort("outputs", i, updates)}
            onRemove={() => handleRemovePort("outputs", i)}
          />
        ))}
      </div>
    </aside>
  );
}

function NameInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const escaping = useRef(false);

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (escaping.current) {
          escaping.current = false;
          setDraft(value);
        } else {
          onCommit(draft);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft);
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          escaping.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-full rounded border border-line-strong bg-bg-3 px-2 py-1 text-fg outline-none focus:border-acc"
      placeholder={placeholder}
    />
  );
}

const SIDE_OPTIONS: PortSide[] = ["left", "right", "top", "bottom"];

function PortRow({
  port,
  onUpdate,
  onRemove,
}: {
  port: PortDef;
  onUpdate: (updates: Partial<PortDef>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-line-soft bg-bg-3 px-2 py-1">
      <span className="h-2 w-2 shrink-0 rounded-full bg-fg-4" />
      <input
        value={port.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="min-w-0 flex-1 bg-transparent text-fg outline-none"
        style={{ fontSize: "11px" }}
      />
      <select
        value={port.side ?? "left"}
        onChange={(e) => onUpdate({ side: e.target.value as PortSide })}
        className="rounded border border-line-strong bg-bg-4 px-1 py-px text-fg-3 outline-none"
        style={{ fontSize: "9px" }}
        title="Handle side"
      >
        {SIDE_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button
        onClick={() => onUpdate({ repeated: !port.repeated })}
        className={`rounded px-1 py-px transition-colors ${
          port.repeated
            ? "bg-st-await-bg text-st-await"
            : "text-fg-4 hover:text-fg-3"
        }`}
        style={{ fontSize: "9px" }}
        title="Toggle repeated"
      >
        repeated
      </button>
      <button
        onClick={onRemove}
        className="text-fg-4 hover:text-st-failed"
        style={{ fontSize: "10px" }}
      >
        ×
      </button>
    </div>
  );
}
