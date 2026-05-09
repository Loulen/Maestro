import { Plus, Repeat, GitBranch } from "lucide-react";
import type { NodeType } from "../types";
import type { LibraryEntry } from "../api";
import { Tooltip } from "./ui/tooltip";
import LibraryDropdown from "./LibraryDropdown";

interface Props {
  onAddNode: (type: NodeType) => void;
  libraryEntries: LibraryEntry[];
  onLibraryDelete: (name: string) => void;
}

export default function EditToolbar({ onAddNode, libraryEntries, onLibraryDelete }: Props) {
  return (
    <div
      className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-md border border-line bg-bg-2/90 p-1 backdrop-blur-sm shadow-lg"
      data-testid="edit-toolbar"
    >
      <Tooltip content="New node · N">
        <button
          data-testid="toolbar-add"
          onClick={() => onAddNode("code-mutating")}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded text-fg-3 transition-colors hover:bg-bg-4 hover:text-fg active:bg-acc active:text-bg-0"
        >
          <Plus size={14} />
        </button>
      </Tooltip>

      <span className="mx-0.5 h-4 w-px bg-line" />

      <LibraryDropdown entries={libraryEntries} onDelete={onLibraryDelete} />

      <Tooltip content="Loop node">
        <button
          data-testid="toolbar-loop"
          onClick={() => onAddNode("loop")}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded text-fg-3 transition-colors hover:bg-bg-4 hover:text-fg active:bg-acc active:text-bg-0"
        >
          <Repeat size={14} />
        </button>
      </Tooltip>

      <Tooltip content="ForEach node">
        <button
          data-testid="toolbar-foreach"
          onClick={() => onAddNode("for-each")}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded text-fg-3 transition-colors hover:bg-bg-4 hover:text-fg active:bg-acc active:text-bg-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="none">
            <circle cx="3" cy="7" r="1.6" />
            <circle cx="9" cy="4" r="1.4" />
            <circle cx="9" cy="7" r="1.4" />
            <circle cx="9" cy="10" r="1.4" />
            <line x1="4.6" y1="7" x2="7" y2="4" stroke="currentColor" strokeWidth="1.2" />
            <line x1="4.6" y1="7" x2="7" y2="7" stroke="currentColor" strokeWidth="1.2" />
            <line x1="4.6" y1="7" x2="7" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </Tooltip>

      <Tooltip content="Switch node">
        <button
          data-testid="toolbar-switch"
          onClick={() => onAddNode("switch")}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded text-fg-3 transition-colors hover:bg-bg-4 hover:text-fg active:bg-acc active:text-bg-0"
        >
          <GitBranch size={14} />
        </button>
      </Tooltip>
    </div>
  );
}
