import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowLeft,
  Archive,
  Columns2,
  ListMinus,
  MessageSquare,
  PanelLeftOpen,
  Rows3,
  SquareArrowOutUpRight,
} from "lucide-react";
import "@git-diff-view/react/styles/diff-view.css";
import { fetchRun, fetchRunRefs, fetchRunStructuredDiff } from "../api";
import { useDaemonSocket } from "../hooks/useDaemonSocket";
import type { RunRefs, RunState, StructuredDiff } from "../types";
import RefPicker from "../components/review/RefPicker";
import ReviewFileList from "../components/review/ReviewFileList";
import ReviewFileCard from "../components/review/ReviewFileCard";
import {
  DEFAULT_FROM,
  DEFAULT_TO,
  defaultCollapsed,
  deliveryOfPair,
  deliverySignature,
  filePath,
  isDefaultPair,
  pairFromSearch,
  readListOpen,
  readView,
  reconcilePair,
  reviewUrl,
  writeListOpen,
  writeView,
} from "../lib/runRefs";
import type { RefPair, ViewMode } from "../lib/runRefs";

/**
 * The **Review page** (#749, ADR-0067; CONTEXT.md § "Relecture de diff"): a
 * dedicated URL — `/runs/<id>/review?from=<ref>&to=<ref>` — rendering the diff
 * between two **Run refs** the way a GitHub PR's "Files changed" does: files on
 * the left with their stats, side-by-side by default (unified toggle remembered
 * on this browser), context expansion between hunks, and a `source →
 * destination` pair picked among the Run's refs (fork point, Run tip, every
 * node delivery's before/after, a running node's live branch).
 *
 * Mounted full-window by `main.tsx` when the path matches; the app has no
 * router. The URL carries stable ref ids, never SHAs. Comments (#750) are not
 * here yet: the gutter and the "Send to manager" pill are reserved for them.
 */

interface Props {
  runId: string;
}

/**
 * The loaded diff, tagged with the key it was fetched for (`from|to|reloadTick`):
 * a key mismatch *is* the loading state, so no effect ever writes "loading".
 */
type Load =
  | { kind: "none" }
  | { kind: "ready"; key: string; diff: StructuredDiff }
  | { kind: "error"; key: string; message: string; status?: number };

const NARROW_QUERY = "(max-width: 900px)";

export default function ReviewPage({ runId }: Props) {
  const [run, setRun] = useState<RunState | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [refs, setRefs] = useState<RunRefs | null>(null);
  const [pair, setPairState] = useState<RefPair>(() => pairFromSearch(window.location.search));
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => readView());
  const [narrow, setNarrow] = useState<boolean>(() => window.matchMedia?.(NARROW_QUERY).matches ?? false);
  const [listOpen, setListOpen] = useState<boolean>(() => readListOpen());
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [load, setLoad] = useState<Load>({ kind: "none" });
  const [reloadTick, setReloadTick] = useState(0);
  const [tipMoved, setTipMoved] = useState(false);
  const [nodeDelivered, setNodeDelivered] = useState<{ nodeId: string; iter: number } | null>(null);

  const mainRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const cardEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const runRef = useRef<RunState | null>(null);
  const sigAtLoad = useRef<string | null>(null);
  const pairRef = useRef(pair);
  useEffect(() => {
    pairRef.current = pair;
  }, [pair]);

  const isArchived = run?.status === "archived";
  const effectiveView: ViewMode = narrow ? "unified" : view;

  // --- Run + refs -----------------------------------------------------------
  useEffect(() => {
    let stale = false;
    fetchRun(runId)
      .then((r) => {
        if (stale) return;
        runRef.current = r;
        setRun(r);
        // The signature at first sight, if the diff loaded before the Run did.
        if (sigAtLoad.current === null) sigAtLoad.current = deliverySignature(r.nodes);
      })
      .catch((e: unknown) => {
        if (!stale) setRunError(e instanceof Error ? e.message : String(e));
      });
    fetchRunRefs(runId)
      .then((r) => {
        if (stale) return;
        setRefs(r);
      })
      .catch(() => {
        // The pickers show ids; the diff loads with the URL pair anyway.
      });
    return () => {
      stale = true;
    };
  }, [runId, reloadTick]);

  useEffect(() => {
    if (run) document.title = `Review · ${run.pipeline_name} · ${runId}`;
  }, [run, runId]);

  // Validate the URL pair once the refs are known; a bad ref falls back with a notice.
  const reconciledFor = useRef<RunRefs | null>(null);
  useEffect(() => {
    if (!refs || reconciledFor.current === refs) return;
    reconciledFor.current = refs;
    const { pair: next, notice: n } = reconcilePair(pairRef.current, refs);
    if (n) {
      setNotice(n);
      setPairState(next);
      window.history.replaceState(null, "", reviewUrl(runId, next));
    }
  }, [refs, runId]);

  // --- Diff -------------------------------------------------------------------
  const sameRef = pair.from === pair.to;
  const { from: pairFrom, to: pairTo } = pair;
  const loadKey = `${pairFrom}|${pairTo}|${reloadTick}`;
  useEffect(() => {
    if (isArchived || sameRef) return;
    let stale = false;
    const key = `${pairFrom}|${pairTo}|${reloadTick}`;
    const query = pairFrom === DEFAULT_FROM && pairTo === DEFAULT_TO ? undefined : { from: pairFrom, to: pairTo };
    fetchRunStructuredDiff(runId, query)
      .then((d) => {
        if (stale) return;
        sigAtLoad.current = runRef.current ? deliverySignature(runRef.current.nodes) : null;
        setTipMoved(false);
        setLoad({ kind: "ready", key, diff: d });
      })
      .catch((e: unknown) => {
        if (stale) return;
        const status = (e as { status?: number })?.status;
        setLoad({ kind: "error", key, message: e instanceof Error ? e.message : String(e), status });
      });
    return () => {
      stale = true;
    };
  }, [runId, pairFrom, pairTo, reloadTick, isArchived, sameRef]);
  /** What the current key has: the loaded diff, an error, or nothing yet. */
  const current = useMemo<Load>(
    () => (load.kind !== "none" && load.key === loadKey ? load : { kind: "none" }),
    [load, loadKey],
  );

  // --- Live: the Run's WebSocket, only to detect "tip moved" / "node delivered".
  const { subscribe } = useDaemonSocket();
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== "event" || !msg.event || msg.event.run_id !== runId) return;
      const ev = msg.event;
      fetchRun(runId)
        .then((r) => {
          runRef.current = r;
          setRun(r);
          const sig = deliverySignature(r.nodes);
          if (sigAtLoad.current !== null && sig !== sigAtLoad.current) setTipMoved(true);
        })
        .catch(() => {});
      if (ev.kind === "node_delivered" && ev.node_id && pairRef.current.to === `live:${ev.node_id}`) {
        setNodeDelivered({ nodeId: ev.node_id, iter: ev.iter ?? 1 });
      }
    });
  }, [subscribe, runId]);

  // --- URL ↔ pair -------------------------------------------------------------
  const setPair = useCallback(
    (next: RefPair) => {
      setPairState(next);
      setCollapsed(null);
      setCurrentIdx(0);
      setNotice(null);
      setNodeDelivered(null);
      window.history.replaceState(null, "", reviewUrl(runId, next));
      mainRef.current?.scrollTo?.({ top: 0 });
    },
    [runId],
  );
  useEffect(() => {
    const onPop = () => setPairState(pairFromSearch(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // --- View persistence -------------------------------------------------------
  const changeView = (v: ViewMode) => {
    setView(v);
    writeView(v);
  };
  const toggleList = () => {
    setListOpen((o) => {
      writeListOpen(!o);
      return !o;
    });
  };
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW_QUERY);
    if (!mq) return;
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // --- Files ------------------------------------------------------------------
  const files = useMemo(() => (current.kind === "ready" ? current.diff.files : []), [current]);
  const collapsedSet = useMemo(() => collapsed ?? defaultCollapsed(files), [collapsed, files]);
  const toggleFile = (path: string) => {
    const next = new Set(collapsedSet);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsed(next);
  };
  const collapseAll = () => {
    const anyOpen = files.some((f) => !collapsedSet.has(filePath(f)));
    setCollapsed(anyOpen ? new Set(files.map(filePath)) : new Set());
  };

  const registerEl = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) cardEls.current.set(path, el);
    else cardEls.current.delete(path);
  }, []);

  const onScroll = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    const top = el.scrollTop;
    let idx = 0;
    files.forEach((f, i) => {
      const card = cardEls.current.get(filePath(f));
      if (card && card.offsetTop <= top + 40) idx = i;
    });
    setCurrentIdx(idx);
  }, [files]);

  const goFile = useCallback(
    (index: number) => {
      const f = files[index];
      if (!f) return;
      const path = filePath(f);
      if (collapsedSet.has(path)) {
        const next = new Set(collapsedSet);
        next.delete(path);
        setCollapsed(next);
      }
      setCurrentIdx(index);
      const card = cardEls.current.get(path);
      const el = mainRef.current;
      if (card && el) el.scrollTo?.({ top: Math.max(0, card.offsetTop - 8), behavior: "smooth" });
    },
    [files, collapsedSet],
  );

  const goHunk = useCallback((dir: 1 | -1) => {
    const el = mainRef.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('tr[data-state="hunk"]'));
    const base = el.getBoundingClientRect().top + 48;
    const target =
      dir === 1
        ? rows.find((r) => r.getBoundingClientRect().top > base + 4)
        : [...rows].reverse().find((r) => r.getBoundingClientRect().top < base - 4);
    if (target) el.scrollBy?.({ top: target.getBoundingClientRect().top - base, behavior: "smooth" });
  }, []);

  // --- Keyboard ---------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "j":
          goFile(Math.min(files.length - 1, currentIdx + 1));
          break;
        case "k":
          goFile(Math.max(0, currentIdx - 1));
          break;
        case "n":
          goHunk(1);
          break;
        case "p":
          goHunk(-1);
          break;
        case "u":
          changeView(view === "split" ? "unified" : "split");
          break;
        case "[":
          toggleList();
          break;
        case "/":
          e.preventDefault();
          if (!listOpen) toggleList();
          window.setTimeout(() => filterRef.current?.focus(), 0);
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files.length, currentIdx, view, listOpen, goFile, goHunk]);

  // --- Exit -------------------------------------------------------------------
  const goBack = () => {
    const sameOrigin = document.referrer && document.referrer.startsWith(window.location.origin);
    if (sameOrigin && window.history.length > 1) window.history.back();
    else window.location.assign("/");
  };

  const reload = () => {
    setTipMoved(false);
    setNodeDelivered(null);
    setReloadTick((t) => t + 1);
  };

  const delivery = refs ? deliveryOfPair(pair, refs) : null;
  const stats = current.kind === "ready" ? current.diff : null;
  const pairIsDefault = isDefaultPair(pair);

  if (runError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-bg-1 text-fg-3" data-testid="review-page">
        <div style={{ fontSize: "12px" }}>Run not found</div>
        <div className="text-fg-4" style={{ fontSize: "11px" }}>
          {runError}
        </div>
        <a href="/" className="mt-2 text-acc" style={{ fontSize: "11px" }}>
          Back to the app
        </a>
      </div>
    );
  }

  return (
    <div className="pdo-review grid h-screen grid-rows-[36px_1fr] bg-bg-1 text-fg" data-testid="review-page">
      {/* ===== Top bar ===== */}
      <div className="relative z-20 flex items-center gap-2 border-b border-line bg-bg-2 px-2.5" style={{ fontSize: "11px" }}>
        <button
          type="button"
          onClick={goBack}
          data-testid="review-back"
          title="Back to the Run (canvas stays where you left it)"
          className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-[3px] text-fg-2 hover:bg-bg-3 hover:text-fg"
        >
          <ArrowLeft size={12} />
          <span className="text-fg-4">
            <span className="font-medium text-fg-2">{run?.pipeline_name ?? "…"}</span> · {runId}
          </span>
        </button>
        <span className="h-4 w-px bg-line-strong" />
        <span className="text-fg-3">Review</span>
        <span className="h-4 w-px bg-line-strong" />

        <div className="flex items-center gap-1" data-testid="review-refpair">
          <RefPicker
            side="from"
            value={pair.from}
            other={pair.to}
            refs={refs}
            disabled={isArchived}
            onPick={(id) => setPair({ from: id, to: pair.to })}
            onPickPair={setPair}
          />
          <span className="px-0.5 text-fg-4">→</span>
          <RefPicker
            side="to"
            value={pair.to}
            other={pair.from}
            refs={refs}
            disabled={isArchived}
            onPick={(id) => setPair({ from: pair.from, to: id })}
            onPickPair={setPair}
          />
          <button
            type="button"
            onClick={() => setPair({ from: pair.to, to: pair.from })}
            disabled={isArchived}
            title="Swap source and destination"
            data-testid="review-swap"
            className="cursor-pointer rounded p-[3px] text-fg-4 hover:bg-bg-3 hover:text-fg-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeftRight size={11} />
          </button>
          {!pairIsDefault && (
            <button
              type="button"
              onClick={() => setPair({ from: DEFAULT_FROM, to: DEFAULT_TO })}
              title="Back to the default pair"
              data-testid="review-reset"
              className="cursor-pointer rounded px-1.5 py-0.5 text-fg-4 hover:bg-bg-3 hover:text-fg-2"
              style={{ fontSize: "10px" }}
            >
              fork → tip
            </button>
          )}
        </div>

        <span className="flex-1" />

        {stats && (
          <span className="flex items-center gap-1.5 text-fg-2" data-testid="review-stats">
            <span>
              {stats.files_changed} file{stats.files_changed === 1 ? "" : "s"}
            </span>
            <span className="font-mono text-st-done">+{stats.additions}</span>
            <span className="font-mono text-st-failed">−{stats.deletions}</span>
          </span>
        )}
        <span className="h-4 w-px bg-line-strong" />
        <div
          className="inline-flex overflow-hidden rounded border border-line-strong"
          title={narrow ? "Unified on narrow windows; your preference is kept" : "Remembered on this browser"}
          role="group"
          data-testid="review-view-toggle"
          data-view={effectiveView}
        >
          <button
            type="button"
            onClick={() => changeView("split")}
            aria-pressed={effectiveView === "split"}
            data-testid="review-view-split"
            className={`flex cursor-pointer items-center gap-1 px-2 py-0.5 ${
              effectiveView === "split" ? "bg-bg-4 text-fg" : "text-fg-3 hover:text-fg-2"
            }`}
            style={{ fontSize: "10.5px" }}
          >
            <Columns2 size={11} /> Split
          </button>
          <button
            type="button"
            onClick={() => changeView("unified")}
            aria-pressed={effectiveView === "unified"}
            data-testid="review-view-unified"
            className={`flex cursor-pointer items-center gap-1 border-l border-line-strong px-2 py-0.5 ${
              effectiveView === "unified" ? "bg-bg-4 text-fg" : "text-fg-3 hover:text-fg-2"
            }`}
            style={{ fontSize: "10.5px" }}
          >
            <Rows3 size={11} /> Unified
          </button>
        </div>
        <button
          type="button"
          onClick={collapseAll}
          disabled={files.length === 0}
          title="Collapse all / expand all"
          data-testid="review-collapse-all"
          className="flex cursor-pointer items-center gap-1 rounded border border-line-strong bg-bg-3 px-2 py-0.5 text-fg-3 hover:text-fg-2 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontSize: "10.5px" }}
        >
          <ListMinus size={11} /> Collapse all
        </button>
        {/* Reserved for #750: comments and their send gesture. Visible, sober, disabled. */}
        <span
          className="flex items-center gap-1 rounded border border-line-strong bg-bg-3 px-2 py-0.5 text-fg-3 opacity-50"
          title="Comments arrive in the next ticket (#750)."
          aria-disabled
          data-testid="review-send-placeholder"
          style={{ fontSize: "10.5px" }}
        >
          <MessageSquare size={11} /> 0 · Send to manager
        </span>
        <a
          href={reviewUrl(runId, pair)}
          target="_blank"
          rel="noreferrer"
          title="Open in a new tab — the URL carries the pair"
          data-testid="review-open-new-tab"
          className="grid h-5 w-[22px] place-items-center rounded border border-line-strong bg-bg-3 text-fg-3 hover:text-fg-2"
        >
          <SquareArrowOutUpRight size={11} />
        </a>
      </div>

      {/* ===== Body ===== */}
      <div className={`grid min-h-0 ${listOpen ? "grid-cols-[272px_1fr]" : "grid-cols-[0_1fr]"}`} data-testid="review-body">
        {listOpen ? (
          <ReviewFileList
            files={files}
            filter={filter}
            onFilterChange={setFilter}
            filterRef={filterRef}
            currentIndex={currentIdx}
            onSelect={goFile}
            onClose={toggleList}
          />
        ) : (
          <div />
        )}

        <div ref={mainRef} onScroll={onScroll} className="relative min-h-0 min-w-0 overflow-y-auto" data-testid="review-main">
          {!listOpen && (
            <button
              type="button"
              onClick={toggleList}
              title="Show file list  ( [ )"
              data-testid="review-list-open"
              className="absolute left-2 top-2 z-20 grid h-6 w-6 cursor-pointer place-items-center rounded border border-line-strong bg-bg-2 text-fg-4 hover:text-fg-2"
            >
              <PanelLeftOpen size={12} />
            </button>
          )}

          {tipMoved && !isArchived && (
            <div
              className="sticky top-0 z-[15] flex items-center gap-2.5 border-b border-st-running/35 bg-st-running-bg px-3 py-1.5 text-st-running"
              style={{ fontSize: "11px" }}
              data-testid="review-tip-moved"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              The Run tip moved since this diff was loaded ·
              <button
                type="button"
                onClick={reload}
                className="cursor-pointer rounded border border-st-running/50 px-2 py-px hover:bg-st-running/20"
              >
                Reload
              </button>
              <span className="text-fg-4">Your scroll position is kept.</span>
            </div>
          )}
          {nodeDelivered && refs && (
            <div
              className="sticky top-0 z-[15] flex items-center gap-2.5 border-b border-st-running/35 bg-st-running-bg px-3 py-1.5 text-st-running"
              style={{ fontSize: "11px" }}
              data-testid="review-node-delivered"
            >
              Node delivered · its live branch is gone ·
              <button
                type="button"
                onClick={() =>
                  setPair({
                    from: `node:${nodeDelivered.nodeId}:${nodeDelivered.iter}:before`,
                    to: `node:${nodeDelivered.nodeId}:${nodeDelivered.iter}:after`,
                  })
                }
                className="cursor-pointer rounded border border-st-running/50 px-2 py-px hover:bg-st-running/20"
              >
                Switch to its after ref
              </button>
            </div>
          )}

          {notice && (
            <div
              className="mx-3 mt-2.5 flex items-center gap-2 rounded-md border border-st-await/35 bg-st-await-bg px-2.5 py-1.5 text-fg-2"
              style={{ fontSize: "11px" }}
              data-testid="review-notice"
            >
              {notice}
              <button type="button" onClick={() => setNotice(null)} className="ml-auto cursor-pointer text-fg-3 hover:text-fg">
                ✕
              </button>
            </div>
          )}

          {delivery && !isArchived && (
            <div
              className="mx-3 mt-2.5 flex items-center gap-2 rounded-md border border-acc-border bg-acc-bg px-2.5 py-1.5 text-fg-2"
              style={{ fontSize: "11px" }}
              data-testid="review-delivery-chip"
            >
              ◈ Reviewing the delivery of <span className="font-medium text-acc">{delivery.node_name}</span> · iter{" "}
              {delivery.iter}
              {delivery.status === "running" && (
                <span className="text-fg-4">(live sub-worktree, not merged back yet)</span>
              )}
              <button
                type="button"
                onClick={() => setPair({ from: DEFAULT_FROM, to: DEFAULT_TO })}
                className="ml-auto cursor-pointer text-fg-3 hover:text-fg"
                style={{ fontSize: "10.5px" }}
                data-testid="review-whole-run"
              >
                Whole Run instead (fork → tip)
              </button>
            </div>
          )}

          {isArchived ? (
            <EmptyState
              testId="review-archived"
              icon={<Archive size={22} className="text-fg-5" />}
              title="Diff not preserved for archived runs"
              hint="The run branch was deleted at cleanup."
            />
          ) : sameRef ? (
            <EmptyState
              testId="review-empty"
              icon={<span className="text-fg-5" style={{ fontSize: "24px" }}>≡</span>}
              title="Nothing to compare"
              hint="Source and destination are the same ref. Pick another destination."
            />
          ) : current.kind === "none" ? (
            <div className="px-4 py-10 text-center text-fg-4" style={{ fontSize: "11px" }} data-testid="review-loading">
              Loading diff…
            </div>
          ) : current.kind === "error" ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center" data-testid="review-error">
              <div className="text-fg-3" style={{ fontSize: "12px" }}>
                {current.status === 404 ? "Run branch not found" : "Could not load the diff"}
              </div>
              <div className="text-fg-4" style={{ fontSize: "11px" }}>
                {current.message}
              </div>
              <button
                type="button"
                onClick={reload}
                className="mt-1 cursor-pointer rounded border border-line-strong bg-bg-3 px-2 py-0.5 text-fg-2 hover:text-fg"
                style={{ fontSize: "10.5px" }}
              >
                Retry
              </button>
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              testId="review-empty"
              icon={<span className="text-fg-5" style={{ fontSize: "24px" }}>≡</span>}
              title="No changes"
              hint="The two refs have identical trees."
            />
          ) : (
            <>
              {files.length > 40 && (
                <div className="mx-3 mt-2.5 rounded border border-line bg-bg-3 px-2.5 py-1 text-fg-3" style={{ fontSize: "10.5px" }}>
                  Large diff — files collapsed
                </div>
              )}
              {files.map((f) => {
                const p = filePath(f);
                return (
                  <ReviewFileCard
                    key={`${pair.from}|${pair.to}|${p}`}
                    runId={runId}
                    file={f}
                    pair={pair}
                    view={effectiveView}
                    collapsed={collapsedSet.has(p)}
                    onToggle={() => toggleFile(p)}
                    registerEl={registerEl}
                  />
                );
              })}
              <div className="h-[40vh]" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  testId,
  icon,
  title,
  hint,
}: {
  testId: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 pt-20 text-center" data-testid={testId}>
      <div className="mb-1">{icon}</div>
      <div className="text-fg-3" style={{ fontSize: "12px" }}>
        {title}
      </div>
      <div className="text-fg-4" style={{ fontSize: "11px" }}>
        {hint}
      </div>
    </div>
  );
}
