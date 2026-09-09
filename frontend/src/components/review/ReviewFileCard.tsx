import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, SquareArrowOutUpRight } from "lucide-react";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import type { DiffFile } from "../../types";
import { fetchRunFileAtRef } from "../../api";
import { baseName, fileHunks, filePath, langOf, statusLetter } from "../../lib/runRefs";
import type { RefPair, ViewMode } from "../../lib/runRefs";

/**
 * One file of the Review page (#749): a sticky header (chevron, status letter,
 * `dir/` + basename, `+a −d`, copy path, open at destination ref) and the
 * third-party diff body — split or unified, with GitHub-style `↑ ⇕ ↓` context
 * expansion in every hunk separator.
 *
 * The daemon's structured diff carries the hunks; the component needs the
 * **full content at each ref** to expand context. It is fetched lazily — the
 * first time the card scrolls into view — from `GET /runs/<id>/file`, and the
 * card renders its hunks meanwhile (without the expanders, which appear once
 * the content is in). A side that does not exist at its ref (an added file's
 * old side, a deleted file's new side) is not fetched: the component composes
 * it from the diff.
 */

interface Props {
  runId: string;
  file: DiffFile;
  pair: RefPair;
  view: ViewMode;
  collapsed: boolean;
  onToggle: () => void;
  /** Lets the page track the card for scroll-spy and "click a file → scroll". */
  registerEl: (path: string, el: HTMLDivElement | null) => void;
}

type Contents =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; old: string | null; new: string | null }
  | { kind: "failed" };

const LETTER_CLASS: Record<"A" | "M" | "D" | "R", string> = {
  A: "text-st-done",
  M: "text-st-await",
  D: "text-st-failed",
  R: "text-edit-tint",
};

export default function ReviewFileCard({ runId, file, pair, view, collapsed, onToggle, registerEl }: Props) {
  const path = filePath(file);
  const letter = statusLetter(file);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [contents, setContents] = useState<Contents>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  const pureRename = file.status === "renamed" && file.hunks.length === 0;
  const hasBody = !file.binary && !pureRename && file.hunks.length > 0;

  useEffect(() => {
    registerEl(path, rootRef.current);
    return () => registerEl(path, null);
  }, [path, registerEl]);

  // The page keys each card by (pair, path): a pair change remounts the card,
  // so the lazily fetched content never survives the refs it was fetched at.

  const load = useCallback(() => {
    if (!hasBody) return;
    setContents({ kind: "loading" });
    const wantOld = file.old_path && file.status !== "added";
    const wantNew = file.new_path && file.status !== "deleted";
    const oldP = wantOld ? fetchRunFileAtRef(runId, file.old_path!, pair.from) : Promise.resolve(null);
    const newP = wantNew ? fetchRunFileAtRef(runId, file.new_path!, pair.to) : Promise.resolve(null);
    Promise.all([oldP, newP])
      .then(([o, n]) => setContents({ kind: "ready", old: o, new: n }))
      .catch(() => setContents({ kind: "failed" }));
  }, [hasBody, runId, file.old_path, file.new_path, file.status, pair.from, pair.to]);

  // Fetch when the card first becomes visible (and only while expanded).
  useEffect(() => {
    if (contents.kind !== "idle" || collapsed || !hasBody) return;
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // jsdom / very old browsers: fetch right away, off the effect body.
      const t = window.setTimeout(load, 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [contents.kind, collapsed, hasBody, load]);

  const hunks = useMemo(() => fileHunks(file), [file]);
  const data = useMemo(() => {
    const ready = contents.kind === "ready" ? contents : null;
    return {
      oldFile: {
        fileName: file.old_path ?? file.new_path ?? "",
        fileLang: langOf(file.old_path ?? file.new_path),
        content: ready?.old ?? "",
      },
      newFile: {
        fileName: file.new_path ?? file.old_path ?? "",
        fileLang: langOf(file.new_path ?? file.old_path),
        content: ready?.new ?? "",
      },
      hunks,
    };
  }, [file.old_path, file.new_path, hunks, contents]);

  const copyPath = () => {
    navigator.clipboard?.writeText(path).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };

  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const openHref =
    file.new_path && file.status !== "deleted"
      ? `/runs/${encodeURIComponent(runId)}/file?path=${encodeURIComponent(file.new_path)}&ref=${encodeURIComponent(pair.to)}`
      : null;

  return (
    <div
      ref={rootRef}
      data-testid="review-file"
      data-path={path}
      data-collapsed={collapsed}
      data-content={contents.kind}
      className="mx-3 my-2.5 overflow-hidden rounded-md border border-line bg-bg-2"
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        data-testid="review-file-header"
        className={`sticky top-0 z-10 flex cursor-pointer select-none items-center gap-2 bg-bg-2 px-2.5 py-[5px] ${
          collapsed ? "" : "border-b border-line"
        }`}
        style={{ fontSize: "11px" }}
      >
        <span className="text-fg-4">
          {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        </span>
        <span className={`w-[14px] text-center font-mono font-semibold ${LETTER_CLASS[letter]}`} style={{ fontSize: "9.5px" }}>
          {letter}
        </span>
        <span className="truncate font-mono" style={{ fontSize: "10.5px" }}>
          {file.status === "renamed" && file.old_path && (
            <span className="text-fg-4">{file.old_path} → </span>
          )}
          <span className="text-fg-4">{dir}</span>
          <span className="font-medium text-fg">{baseName(path)}</span>
        </span>
        {file.binary ? (
          <span className="text-fg-4" style={{ fontSize: "10px" }}>
            binary
          </span>
        ) : pureRename ? (
          <span className="text-fg-4" style={{ fontSize: "10px" }}>
            renamed
          </span>
        ) : (
          <span className="font-mono" style={{ fontSize: "10px" }}>
            <span className="text-st-done">+{file.additions}</span> <span className="text-st-failed">−{file.deletions}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={copyPath}
            title={copied ? "Copied" : "Copy path"}
            data-testid="review-copy-path"
            className="grid h-5 w-[22px] cursor-pointer place-items-center rounded text-fg-4 hover:bg-bg-3 hover:text-fg-2"
          >
            <Copy size={11} />
          </button>
          {openHref && (
            <a
              href={openHref}
              target="_blank"
              rel="noreferrer"
              title="Open file at destination ref"
              data-testid="review-open-file"
              className="grid h-5 w-[22px] place-items-center rounded text-fg-4 hover:bg-bg-3 hover:text-fg-2"
            >
              <SquareArrowOutUpRight size={11} />
            </a>
          )}
        </span>
      </div>

      {!collapsed && (
        <div data-testid="review-file-body" className="overflow-x-auto">
          {file.binary ? (
            <div className="px-4 py-[18px] text-center text-fg-4" style={{ fontSize: "11px" }}>
              Binary file, not shown
            </div>
          ) : pureRename ? (
            <div className="px-4 py-[18px] text-center text-fg-4" style={{ fontSize: "11px" }}>
              Renamed without changes
            </div>
          ) : file.hunks.length === 0 ? (
            <div className="px-4 py-[18px] text-center text-fg-4" style={{ fontSize: "11px" }}>
              No content changes
            </div>
          ) : (
            <DiffView
              data={data}
              diffViewMode={view === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
              diffViewTheme="dark"
              diffViewFontSize={11}
              diffViewHighlight={false}
              diffViewWrap={false}
              diffViewAddWidget
              renderWidgetLine={({ onClose }) => (
                <div
                  className="flex items-center gap-2 border-y border-line bg-bg-3 px-3 py-1.5 text-fg-3"
                  style={{ fontSize: "10.5px" }}
                  data-testid="review-comment-placeholder"
                >
                  Review comments arrive with the next ticket (#750).
                  <button
                    type="button"
                    onClick={onClose}
                    className="ml-auto cursor-pointer rounded border border-line-strong px-1.5 text-fg-3 hover:text-fg"
                  >
                    Close
                  </button>
                </div>
              )}
            />
          )}
          {contents.kind === "failed" && hasBody && (
            <div className="border-t border-line px-3 py-1 text-fg-4" style={{ fontSize: "10px" }}>
              Full file content unavailable at these refs — context expansion disabled for this file.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
