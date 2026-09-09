import { PanelLeftClose } from "lucide-react";
import type { RefObject } from "react";
import type { DiffFile } from "../../types";
import { baseName, filePath, groupByDir, miniBar, statusLetter } from "../../lib/runRefs";

/**
 * The Review page's left column (#749, design option "flat list grouped by
 * directory"): filter box, directory headers, one row per file with its status
 * letter, `+a −d` and a 5-block mini bar. The current file follows the scroll;
 * clicking a row scrolls to it.
 */

interface Props {
  files: DiffFile[];
  filter: string;
  onFilterChange: (v: string) => void;
  filterRef: RefObject<HTMLInputElement | null>;
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

const LETTER_CLASS: Record<"A" | "M" | "D" | "R", string> = {
  A: "text-st-done",
  M: "text-st-await",
  D: "text-st-failed",
  R: "text-edit-tint",
};

export default function ReviewFileList({
  files,
  filter,
  onFilterChange,
  filterRef,
  currentIndex,
  onSelect,
  onClose,
}: Props) {
  const q = filter.trim().toLowerCase();
  const shown = files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => !q || filePath(file).toLowerCase().includes(q));
  const groups = groupByDir(shown.map((s) => s.file)).map((g) => ({
    dir: g.dir,
    files: g.files.map((f) => ({ file: f.file, index: shown[f.index].index })),
  }));

  return (
    <aside
      className="flex min-h-0 flex-col overflow-hidden border-r border-line bg-bg-1"
      data-testid="review-file-list"
    >
      <div className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-2 text-fg-3" style={{ fontSize: "10.5px" }}>
        <button
          type="button"
          onClick={onClose}
          title="Hide file list  ( [ )"
          data-testid="review-list-close"
          className="grid h-5 w-5 cursor-pointer place-items-center rounded text-fg-4 hover:bg-bg-3 hover:text-fg-2"
        >
          <PanelLeftClose size={12} />
        </button>
        <input
          ref={filterRef}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter files…   /"
          data-testid="review-file-filter"
          className="min-w-0 flex-1 rounded border border-line bg-bg-2 px-1.5 py-0.5 text-fg outline-none focus:border-acc-border"
          style={{ fontSize: "11px" }}
        />
        <span className="font-mono text-fg-4" data-testid="review-file-count">
          {shown.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2.5">
        {groups.length === 0 && (
          <div className="px-2 py-2.5 text-fg-4" style={{ fontSize: "11px" }}>
            {files.length === 0 ? "No files" : "No file matches"}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.dir || "."}>
            <div
              className="truncate px-1.5 pb-0.5 pt-1.5 font-mono text-fg-4"
              style={{ fontSize: "10px" }}
              title={g.dir ? `${g.dir}/` : "./"}
            >
              {g.dir ? `${g.dir}/` : "./"}
            </div>
            {g.files.map(({ file, index }) => {
              const p = filePath(file);
              const letter = statusLetter(file);
              const cur = index === currentIndex;
              const pureRename = file.status === "renamed" && file.additions + file.deletions === 0;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSelect(index)}
                  title={p}
                  data-testid="review-file-row"
                  data-path={p}
                  data-current={cur}
                  className={`grid w-full cursor-pointer grid-cols-[14px_1fr_auto] items-center gap-1.5 rounded px-1.5 py-[3px] text-left ${
                    cur ? "bg-bg-3 shadow-[inset_2px_0_0_var(--color-acc)]" : "hover:bg-bg-3"
                  }`}
                  style={{ fontSize: "11px" }}
                >
                  <span
                    className={`w-[14px] text-center font-mono font-semibold ${LETTER_CLASS[letter]}`}
                    style={{ fontSize: "9.5px" }}
                  >
                    {letter}
                  </span>
                  <span className={`truncate font-mono ${cur ? "text-fg" : "text-fg-2"}`} style={{ fontSize: "10.5px" }}>
                    {baseName(p)}
                  </span>
                  <span className="flex items-center gap-1 font-mono" style={{ fontSize: "10px" }}>
                    {file.binary ? (
                      <span className="text-fg-4">bin</span>
                    ) : pureRename ? (
                      <span className="text-fg-4">→</span>
                    ) : (
                      <>
                        <span className="text-st-done">+{file.additions}</span>
                        <span className="text-st-failed">−{file.deletions}</span>
                      </>
                    )}
                    <span className="ml-0.5 inline-flex gap-px" aria-hidden>
                      {miniBar(file).map((b, i) => (
                        <i
                          key={i}
                          className={`block h-2 w-[3px] rounded-[1px] ${
                            b === "a" ? "bg-st-done" : b === "d" ? "bg-st-failed" : "bg-bg-4"
                          }`}
                        />
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div
        className="mt-auto flex flex-wrap gap-2 border-t border-line px-2.5 py-2 text-fg-4"
        style={{ fontSize: "10px" }}
      >
        <span>
          <Kbd>j</Kbd>/<Kbd>k</Kbd> file
        </span>
        <span>
          <Kbd>n</Kbd>/<Kbd>p</Kbd> hunk
        </span>
        <span>
          <Kbd>u</Kbd> view
        </span>
        <span>
          <Kbd>[</Kbd> list
        </span>
      </div>
    </aside>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="rounded-[3px] border border-b-2 border-line-strong bg-bg-3 px-1 font-mono text-fg-3"
      style={{ fontSize: "10px" }}
    >
      {children}
    </kbd>
  );
}
