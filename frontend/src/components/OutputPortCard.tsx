import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PortDef, FrontmatterFieldDecl } from "../types";
import InspectorPortRow from "./InspectorPortRow";
import OutputSchemaEditor from "./OutputSchemaEditor";

interface OutputPortCardProps {
  port: PortDef;
  highlighted?: boolean;
  onUpdate: (updates: Partial<PortDef>) => void;
  onRemove: () => void;
  schema: Record<string, FrontmatterFieldDecl> | null | undefined;
  onSchemaChange: (schema: Record<string, FrontmatterFieldDecl> | undefined) => void;
}

export default function OutputPortCard({
  port,
  highlighted,
  onUpdate,
  onRemove,
  schema,
  onSchemaChange,
}: OutputPortCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      data-testid={`output-port-card-${port.name}`}
      className={`op-tab${collapsed ? " collapsed" : ""}`}
    >
      <div className="op-head">
        <button
          className="op-chev"
          aria-label="Toggle output body"
          onClick={() => setCollapsed((c) => !c)}
        >
          <ChevronDown size={14} />
        </button>
        <InspectorPortRow
          port={port}
          highlighted={highlighted}
          isLast
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      </div>
      {!collapsed && (
        <div className="op-body">
          <OutputSchemaEditor schema={schema} onChange={onSchemaChange} />
        </div>
      )}
    </div>
  );
}
