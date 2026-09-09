import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ReviewPage from "./ReviewPage";
import type { ReviewComment, RunRefs, RunState, StructuredDiff, DiffFile } from "../types";

// The Review page (#749): pair from the URL, refs from the daemon, files from the
// structured diff, the third-party body mocked to a marker (its own rendering is
// the library's business; the e2e FP exercises the real one).

vi.mock("../api", () => ({
  fetchRun: vi.fn(),
  fetchRunRefs: vi.fn(),
  fetchRunStructuredDiff: vi.fn(),
  fetchRunFileAtRef: vi.fn(),
  sendReviewComments: vi.fn(),
}));

vi.mock("../hooks/useDaemonSocket", () => ({
  useDaemonSocket: () => ({ status: "connected", subscribe: () => () => {} }),
}));

// The body mock exposes the two seams #750 plugs into: a `+` per side/line that
// opens `renderWidgetLine`, and one extend slot per `extendData` entry rendered
// through `renderExtendLine`.
vi.mock("@git-diff-view/react", async () => {
  const React = await import("react");
  const SplitSide = { old: 1, new: 2 } as const;
  type Slot = { data: unknown };
  type Props = {
    diffViewMode: string;
    data: { hunks: string[]; oldFile: { content: string }; newFile: { content: string } };
    extendData?: { oldFile?: Record<string, Slot>; newFile?: Record<string, Slot> };
    renderWidgetLine?: (a: { side: number; lineNumber: number; diffFile: unknown; onClose: () => void }) => React.ReactNode;
    renderExtendLine?: (a: { side: number; lineNumber: number; data: unknown; diffFile: unknown; onUpdate: () => void }) => React.ReactNode;
  };
  const DiffView = (props: Props) => {
    const [widget, setWidget] = React.useState<{ side: number; line: number } | null>(null);
    const slots: React.ReactNode[] = [];
    for (const [sideName, side] of [["old", SplitSide.old], ["new", SplitSide.new]] as const) {
      const rec = props.extendData?.[sideName === "old" ? "oldFile" : "newFile"] ?? {};
      for (const [line, slot] of Object.entries(rec)) {
        slots.push(
          <div key={`${sideName}-${line}`} data-testid="mock-extend" data-side={sideName} data-line={line}>
            {props.renderExtendLine?.({ side, lineNumber: Number(line), data: slot.data, diffFile: null, onUpdate: () => {} })}
          </div>,
        );
      }
    }
    return (
      <div
        data-testid="mock-diff-view"
        data-mode={props.diffViewMode}
        data-hunks={props.data.hunks.length}
        data-has-content={Boolean(props.data.oldFile.content || props.data.newFile.content)}
      >
        <button type="button" data-testid="mock-add-new-2" onClick={() => setWidget({ side: SplitSide.new, line: 2 })} />
        <button type="button" data-testid="mock-add-old-2" onClick={() => setWidget({ side: SplitSide.old, line: 2 })} />
        {widget && (
          <div data-testid="mock-widget">
            {props.renderWidgetLine?.({ side: widget.side, lineNumber: widget.line, diffFile: null, onClose: () => setWidget(null) })}
          </div>
        )}
        {slots}
      </div>
    );
  };
  return { DiffModeEnum: { Split: "split", Unified: "unified" }, SplitSide, DiffView };
});

import { fetchRun, fetchRunRefs, fetchRunStructuredDiff, fetchRunFileAtRef, sendReviewComments } from "../api";

const mockedRun = vi.mocked(fetchRun);
const mockedRefs = vi.mocked(fetchRunRefs);
const mockedDiff = vi.mocked(fetchRunStructuredDiff);
const mockedFile = vi.mocked(fetchRunFileAtRef);
const mockedSend = vi.mocked(sendReviewComments);

const RUN_ID = "20260909-125942-c7e2c65";

function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    run_id: RUN_ID,
    status: "completed",
    pipeline_name: "implement-loop",
    input: "x",
    started_at: "2026-09-09T00:00:00Z",
    completed_at: "2026-09-09T01:00:00Z",
    nodes: {},
    edges: [],
    node_defs: [],
    start_node: null,
    end_node: null,
    merge_resolver: null,
    loop_states: {},
    foreach_states: {},
    ...overrides,
  };
}

const REFS: RunRefs = {
  default_from: "fork",
  default_to: "tip",
  refs: [
    { id: "fork", kind: "fork", label: "Fork point", git_ref: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    { id: "node:impl:1:before", kind: "before", label: "implement · iter 1 · before", git_ref: "a", sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", node_id: "impl", node_name: "implement", iter: 1 },
    { id: "node:impl:1:after", kind: "after", label: "implement · iter 1 · after", git_ref: "b", sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", node_id: "impl", node_name: "implement", iter: 1 },
    { id: "tip", kind: "tip", label: "Run tip", git_ref: `pdo/run-${RUN_ID}`, sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
  ],
  deliveries: [
    { node_id: "impl", node_name: "implement", iter: 1, status: "delivered", before: "node:impl:1:before", after: "node:impl:1:after" },
  ],
};

function file(overrides: Partial<DiffFile> & { path: string }): DiffFile {
  const { path, ...rest } = overrides;
  return {
    old_path: path,
    new_path: path,
    status: "modified",
    binary: false,
    additions: 2,
    deletions: 1,
    hunks: [
      {
        old_start: 1,
        old_lines: 2,
        new_start: 1,
        new_lines: 3,
        header: "",
        lines: [
          { kind: "context", content: "a", old_no: 1, new_no: 1 },
          { kind: "del", content: "b", old_no: 2, new_no: null },
          { kind: "add", content: "B", old_no: null, new_no: 2 },
          { kind: "add", content: "C", old_no: null, new_no: 3 },
        ],
      },
    ],
    ...rest,
  };
}

function diff(files: DiffFile[], extra: Partial<StructuredDiff> = {}): StructuredDiff {
  return {
    from_ref: "fork",
    to_ref: "tip",
    from_sha: "a",
    to_sha: "b",
    three_dot: true,
    files,
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
    files_changed: files.length,
    ...extra,
  };
}

const TWO = diff([file({ path: "src/main.tsx" }), file({ path: "docs/adr/0068.md", status: "added", old_path: null, deletions: 0 })]);

function goto(search = "") {
  window.history.replaceState(null, "", `/runs/${RUN_ID}/review${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mockedRun.mockResolvedValue(makeRun());
  mockedRefs.mockResolvedValue(REFS);
  mockedDiff.mockResolvedValue(TWO);
  mockedFile.mockResolvedValue("a\nB\nC\n");
  goto();
});

describe("ReviewPage (#749)", () => {
  it("loads fork → tip by default: file list, stats, both pickers labelled", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    expect(mockedDiff).toHaveBeenCalledWith(RUN_ID, undefined);
    expect(screen.getByTestId("review-stats")).toHaveTextContent("2 files");
    expect(screen.getByTestId("review-stats")).toHaveTextContent("+4");
    expect(screen.getByTestId("review-stats")).toHaveTextContent("−1");
    await waitFor(() => expect(screen.getByTestId("review-from")).toHaveTextContent("Fork point"));
    expect(screen.getByTestId("review-to")).toHaveTextContent("Run tip");
    expect(screen.getByTestId("review-to")).toHaveTextContent("bbbbbbb");
    // Left list: grouped by directory, +/- per row.
    const rows = screen.getAllByTestId("review-file-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("main.tsx");
    expect(rows[0]).toHaveTextContent("+2");
    expect(rows[0]).toHaveTextContent("−1");
    const list = screen.getByTestId("review-file-list");
    expect(within(list).getByText("src/")).toBeInTheDocument();
    expect(within(list).getByText("docs/adr/")).toBeInTheDocument();
    // Default pair: no reset, no delivery chip.
    expect(screen.queryByTestId("review-reset")).toBeNull();
    expect(screen.queryByTestId("review-delivery-chip")).toBeNull();
    // Split is the default; the body gets it.
    expect(screen.getByTestId("review-view-toggle")).toHaveAttribute("data-view", "split");
    expect(screen.getAllByTestId("mock-diff-view")[0]).toHaveAttribute("data-mode", "split");
    expect(screen.getByTestId("review-back")).toHaveTextContent("implement-loop");
  });

  it("fetches the full content at both refs for context expansion, only for existing sides", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    await waitFor(() => expect(mockedFile).toHaveBeenCalledTimes(3));
    // Modified file: both sides at their ref ids.
    expect(mockedFile).toHaveBeenCalledWith(RUN_ID, "src/main.tsx", "fork");
    expect(mockedFile).toHaveBeenCalledWith(RUN_ID, "src/main.tsx", "tip");
    // Added file: only the new side.
    expect(mockedFile).toHaveBeenCalledWith(RUN_ID, "docs/adr/0068.md", "tip");
    await waitFor(() =>
      expect(screen.getAllByTestId("mock-diff-view")[0]).toHaveAttribute("data-has-content", "true"),
    );
  });

  it("opens a delivery pair from the URL: chip, reset, two-dot fetch by ids", async () => {
    goto("?from=node%3Aimpl%3A1%3Abefore&to=node%3Aimpl%3A1%3Aafter");
    mockedDiff.mockResolvedValue(diff([file({ path: "src/main.tsx" })], { three_dot: false }));
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(1));
    expect(mockedDiff).toHaveBeenCalledWith(RUN_ID, { from: "node:impl:1:before", to: "node:impl:1:after" });
    await waitFor(() => expect(screen.getByTestId("review-delivery-chip")).toBeInTheDocument());
    expect(screen.getByTestId("review-delivery-chip")).toHaveTextContent("Reviewing the delivery of implement · iter 1");
    expect(screen.getByTestId("review-from")).toHaveTextContent("implement · iter 1 · before");
    expect(screen.getByTestId("review-to")).toHaveTextContent("implement · iter 1 · after");
    expect(screen.getByTestId("review-reset")).toBeInTheDocument();

    // "Whole Run instead" goes back to the default pair and the short URL.
    fireEvent.click(screen.getByTestId("review-whole-run"));
    await waitFor(() => expect(mockedDiff).toHaveBeenLastCalledWith(RUN_ID, undefined));
    expect(window.location.search).toBe("");
  });

  it("picking a delivery row in a picker sets both sides and the URL", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByTestId("review-from")).toHaveTextContent("Fork point"));
    fireEvent.click(screen.getByTestId("review-to"));
    const pop = screen.getByTestId("review-ref-popover-to");
    expect(within(pop).getByTestId("review-ref-option-fork")).toBeDisabled(); // used on the other side
    fireEvent.click(within(pop).getByTestId("review-delivery-impl-1"));
    await waitFor(() =>
      expect(mockedDiff).toHaveBeenLastCalledWith(RUN_ID, { from: "node:impl:1:before", to: "node:impl:1:after" }),
    );
    expect(window.location.search).toBe("?from=node%3Aimpl%3A1%3Abefore&to=node%3Aimpl%3A1%3Aafter");
    expect(screen.queryByTestId("review-ref-popover-to")).toBeNull();
  });

  it("picking one side only changes that side; swap exchanges them", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByTestId("review-from")).toHaveTextContent("Fork point"));
    fireEvent.click(screen.getByTestId("review-to"));
    fireEvent.click(within(screen.getByTestId("review-ref-popover-to")).getByTestId("review-ref-option-node:impl:1:after"));
    await waitFor(() => expect(mockedDiff).toHaveBeenLastCalledWith(RUN_ID, { from: "fork", to: "node:impl:1:after" }));
    fireEvent.click(screen.getByTestId("review-swap"));
    await waitFor(() => expect(mockedDiff).toHaveBeenLastCalledWith(RUN_ID, { from: "node:impl:1:after", to: "fork" }));
  });

  it("shows « Nothing to compare » for the same ref twice, without fetching", async () => {
    goto("?from=tip&to=tip");
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByTestId("review-empty")).toHaveTextContent("Nothing to compare"));
    expect(mockedDiff).not.toHaveBeenCalled();
  });

  it("shows « No changes » for identical trees", async () => {
    mockedDiff.mockResolvedValue(diff([]));
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByTestId("review-empty")).toHaveTextContent("No changes"));
  });

  it("falls back to the default side for an unknown ref in the URL, with a notice", async () => {
    goto("?from=node%3Aghost%3A1%3Abefore&to=tip");
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByTestId("review-notice")).toBeInTheDocument());
    expect(screen.getByTestId("review-notice")).toHaveTextContent('Unknown ref "node:ghost:1:before"');
    await waitFor(() => expect(screen.getByTestId("review-from")).toHaveTextContent("Fork point"));
    expect(window.location.search).toBe("");
  });

  it("remembers the Split | Unified toggle on this browser", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("mock-diff-view")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("review-view-unified"));
    expect(localStorage.getItem("pdo.review.view")).toBe("unified");
    expect(screen.getByTestId("review-view-toggle")).toHaveAttribute("data-view", "unified");
    expect(screen.getAllByTestId("mock-diff-view")[0]).toHaveAttribute("data-mode", "unified");
  });

  it("starts unified when the browser remembers it", async () => {
    localStorage.setItem("pdo.review.view", "unified");
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("mock-diff-view")).toHaveLength(2));
    expect(screen.getAllByTestId("mock-diff-view")[0]).toHaveAttribute("data-mode", "unified");
  });

  it("collapses and expands a file from its header; the list click scrolls and expands", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    const card = screen.getAllByTestId("review-file")[0];
    fireEvent.click(within(card).getByTestId("review-file-header"));
    expect(card).toHaveAttribute("data-collapsed", "true");
    expect(within(card).queryByTestId("review-file-body")).toBeNull();
    fireEvent.click(screen.getAllByTestId("review-file-row")[0]);
    expect(card).toHaveAttribute("data-collapsed", "false");
    // Collapse all, then expand all.
    fireEvent.click(screen.getByTestId("review-collapse-all"));
    for (const c of screen.getAllByTestId("review-file")) expect(c).toHaveAttribute("data-collapsed", "true");
    fireEvent.click(screen.getByTestId("review-collapse-all"));
    for (const c of screen.getAllByTestId("review-file")) expect(c).toHaveAttribute("data-collapsed", "false");
  });

  it("filters the file list", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file-row")).toHaveLength(2));
    fireEvent.change(screen.getByTestId("review-file-filter"), { target: { value: "adr" } });
    expect(screen.getAllByTestId("review-file-row")).toHaveLength(1);
    expect(screen.getByTestId("review-file-count")).toHaveTextContent("1");
  });

  it("says the diff is not preserved for an archived Run and disables the pickers", async () => {
    mockedRun.mockResolvedValue(makeRun({ status: "archived" }));
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByTestId("review-archived")).toBeInTheDocument());
    expect(screen.getByText("Diff not preserved for archived runs")).toBeInTheDocument();
    expect(screen.getByTestId("review-from")).toBeDisabled();
    expect(screen.getByTestId("review-to")).toBeDisabled();
  });

  it("renders binary and pure-rename bodies as words, not tables", async () => {
    mockedDiff.mockResolvedValue(
      diff([
        file({ path: "img.png", status: "added", old_path: null, binary: true, additions: 0, deletions: 0, hunks: [] }),
        file({ path: "b.ts", status: "renamed", old_path: "a.ts", additions: 0, deletions: 0, hunks: [] }),
      ]),
    );
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    expect(screen.getByText("Binary file, not shown")).toBeInTheDocument();
    expect(screen.getByText("Renamed without changes")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-diff-view")).toBeNull();
    expect(mockedFile).not.toHaveBeenCalled();
  });

  it("shows an error with Retry when the diff endpoint fails", async () => {
    mockedDiff.mockRejectedValueOnce(Object.assign(new Error("run branch not found"), { status: 404 }));
    mockedDiff.mockResolvedValueOnce(TWO);
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByTestId("review-error")).toHaveTextContent("Run branch not found"));
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
  });

  it("carries the pair in the open-in-new-tab link; the comments pill is a disabled counter without comments", async () => {
    goto("?from=fork&to=node%3Aimpl%3A1%3Aafter");
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    expect(screen.getByTestId("review-open-new-tab")).toHaveAttribute(
      "href",
      `/runs/${RUN_ID}/review?from=fork&to=node%3Aimpl%3A1%3Aafter`,
    );
    expect(screen.getByTestId("review-comments-pill")).toBeDisabled();
    expect(screen.getByTestId("review-comments-pill")).toHaveTextContent("0 comments");
    expect(screen.queryByTestId("review-send-bar")).toBeNull();
  });
});

// --- #750: review comments ---------------------------------------------------

function sentComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "rc-001",
    path: "src/main.tsx",
    side: "new",
    line: 3,
    from_ref: "fork",
    to_ref: "tip",
    text: "Sent remark",
    author: "user",
    sent_at: "2026-09-09T00:30:00Z",
    status: "sent",
    ...overrides,
  };
}

async function openEditorAndSave(text: string, testId = "mock-add-new-2") {
  fireEvent.click(within(screen.getAllByTestId("review-file")[0]).getByTestId(testId));
  const editor = await screen.findByTestId("review-comment-editor");
  fireEvent.change(within(editor).getByTestId("review-editor-text"), { target: { value: text } });
  fireEvent.click(within(editor).getByTestId("review-editor-save"));
}

describe("ReviewPage — review comments (#750)", () => {
  it("opens the inline editor from +, saves a draft that renders markdown under the line and persists across a reload", async () => {
    const { unmount } = render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    fireEvent.click(within(screen.getAllByTestId("review-file")[0]).getByTestId("mock-add-new-2"));
    const editor = await screen.findByTestId("review-comment-editor");
    expect(editor).toHaveTextContent("New comment");
    expect(editor).toHaveTextContent("main.tsx:R2 · destination side");
    expect(within(editor).getByTestId("review-editor-save")).toBeDisabled();
    fireEvent.change(within(editor).getByTestId("review-editor-text"), { target: { value: "Use `const` here" } });
    // The half-typed text survives a reload (sessionStorage).
    expect(sessionStorage.getItem(`pdo.review.wip.${RUN_ID}|src/main.tsx|new|2|fork|tip`)).toBe("Use `const` here");
    fireEvent.click(within(editor).getByTestId("review-editor-preview"));
    expect(within(editor).getByTestId("review-editor-preview-body").querySelector("code")).toHaveTextContent("const");
    fireEvent.click(within(editor).getByTestId("review-editor-write"));
    fireEvent.click(within(editor).getByTestId("review-editor-save"));

    const card = await screen.findByTestId("review-comment");
    expect(card).toHaveAttribute("data-state", "draft");
    expect(card).toHaveAttribute("data-anchor", "main.tsx:R2");
    expect(card.querySelector("code")).toHaveTextContent("const");
    expect(card).toHaveTextContent("Only in this browser until sent.");
    expect(screen.getByTestId("review-toast")).toHaveTextContent("Draft saved");
    expect(screen.queryByTestId("review-comment-editor")).toBeNull();
    expect(sessionStorage.getItem(`pdo.review.wip.${RUN_ID}|src/main.tsx|new|2|fork|tip`)).toBeNull();
    // Chrome: pill, footer bar with a chip, header + sidebar badges, Comments section.
    expect(screen.getByTestId("review-send-pill")).toHaveTextContent("Send 1 draft to manager");
    expect(screen.getByTestId("review-send-bar")).toHaveTextContent("1 draft ready to send");
    expect(screen.getByTestId("review-send-chip")).toHaveTextContent("main.tsx:R2");
    expect(screen.getAllByTestId("review-file")[0]).toHaveAttribute("data-drafts", "1");
    expect(screen.getAllByTestId("review-comment-row")).toHaveLength(1);
    expect(screen.getByTestId("review-comments-count")).toHaveTextContent("1 draft · 0 sent");

    // Reload: the draft is still there.
    unmount();
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByTestId("review-comment")).toHaveAttribute("data-state", "draft"));
  });

  it("edits and deletes a draft; + on a drafted line re-opens that draft (one comment per line)", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    await openEditorAndSave("first");
    // + again on the same line: edit, not a second comment.
    fireEvent.click(within(screen.getAllByTestId("review-file")[0]).getByTestId("mock-add-new-2"));
    const editor = await screen.findByTestId("review-comment-editor");
    expect(editor).toHaveTextContent("Edit draft");
    expect(within(editor).getByTestId("review-editor-text")).toHaveValue("first");
    fireEvent.change(within(editor).getByTestId("review-editor-text"), { target: { value: "second" } });
    fireEvent.keyDown(within(editor).getByTestId("review-editor-text"), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(screen.getByTestId("review-comment")).toHaveTextContent("second"));
    expect(screen.getAllByTestId("review-comment")).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(`pdo.review.drafts.${RUN_ID}`)!)[0].text).toBe("second");
    // Esc cancels an edit without touching the text.
    fireEvent.click(screen.getByTestId("review-comment-edit"));
    fireEvent.keyDown(await screen.findByTestId("review-editor-text"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("review-comment-editor")).toBeNull());
    expect(screen.getByTestId("review-comment")).toHaveTextContent("second");
    // Delete.
    fireEvent.click(screen.getByTestId("review-comment-delete"));
    await waitFor(() => expect(screen.queryByTestId("review-comment")).toBeNull());
    expect(localStorage.getItem(`pdo.review.drafts.${RUN_ID}`)).toBeNull();
    expect(screen.queryByTestId("review-send-bar")).toBeNull();
  });

  it("Send all posts every draft of the pair as one batch, drops them and shows the sent cards from the projected state", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    await openEditorAndSave("one");
    await openEditorAndSave("two", "mock-add-old-2");
    expect(screen.getAllByTestId("review-comment")).toHaveLength(2);
    expect(screen.getByTestId("review-send-bar")).toHaveTextContent("2 drafts ready to send");
    expect(screen.getByTestId("review-send-bar-note")).toHaveTextContent("starts it first");

    const sent = [sentComment({ id: "rc-001", side: "new", line: 2, text: "one" }), sentComment({ id: "rc-002", side: "old", line: 2, text: "two" })];
    mockedSend.mockResolvedValue({ sent, batch_id: "b1", manager_started: true });
    mockedRun.mockResolvedValue(makeRun({ has_manager: true, review_comments: sent }));
    fireEvent.click(screen.getByTestId("review-send-all"));

    await waitFor(() => expect(mockedSend).toHaveBeenCalledTimes(1));
    expect(mockedSend).toHaveBeenCalledWith(RUN_ID, [
      { path: "src/main.tsx", side: "new", line: 2, from: "fork", to: "tip", text: "one" },
      { path: "src/main.tsx", side: "old", line: 2, from: "fork", to: "tip", text: "two" },
    ]);
    await waitFor(() => expect(screen.getAllByTestId("review-comment").every((c) => c.dataset.state === "sent")).toBe(true));
    expect(screen.getAllByTestId("review-comment")).toHaveLength(2);
    expect(screen.getByTestId("review-toast")).toHaveTextContent("2 comments sent as one message — manager started");
    expect(localStorage.getItem(`pdo.review.drafts.${RUN_ID}`)).toBeNull();
    expect(screen.queryByTestId("review-send-bar")).toBeNull();
    expect(screen.getByTestId("review-comments-pill")).toHaveTextContent("2 sent");
    // Sent card: id, pair, lock, no edit/delete.
    const first = screen.getAllByTestId("review-comment").find((c) => c.dataset.commentId === "rc-001")!;
    expect(within(first).getByTestId("review-comment-id")).toHaveTextContent("rc-001");
    expect(first).toHaveTextContent("Fork point → Run tip");
    expect(first).toHaveTextContent("Awaiting manager reply");
    expect(within(first).getByTestId("review-comment-lock")).toBeInTheDocument();
    expect(within(first).queryByTestId("review-comment-edit")).toBeNull();
    expect(within(first).queryByTestId("review-comment-delete")).toBeNull();
    // + on a sent line: nothing opens, a toast explains.
    fireEvent.click(within(screen.getAllByTestId("review-file")[0]).getByTestId("mock-add-new-2"));
    await waitFor(() => expect(screen.getByTestId("review-toast")).toHaveTextContent("already has a sent comment"));
    expect(screen.queryByTestId("review-comment-editor")).toBeNull();
  });

  it("keeps the drafts when the send fails and says so", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    await openEditorAndSave("one");
    mockedSend.mockRejectedValue(new Error("the manager tmux session did not come up"));
    fireEvent.click(screen.getByTestId("review-comment-send"));
    await waitFor(() => expect(screen.getByTestId("review-toast")).toHaveAttribute("data-error", "true"));
    expect(screen.getByTestId("review-toast")).toHaveTextContent("did not come up");
    expect(screen.getByTestId("review-comment")).toHaveAttribute("data-state", "draft");
    expect(JSON.parse(localStorage.getItem(`pdo.review.drafts.${RUN_ID}`)!)).toHaveLength(1);
  });

  it("Send now from the editor saves and sends that one comment", async () => {
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    const sent = [sentComment({ id: "rc-001", line: 2, text: "quick" })];
    mockedSend.mockResolvedValue({ sent, batch_id: "b1", manager_started: false });
    mockedRun.mockResolvedValue(makeRun({ has_manager: true, review_comments: sent }));
    fireEvent.click(within(screen.getAllByTestId("review-file")[0]).getByTestId("mock-add-new-2"));
    const editor = await screen.findByTestId("review-comment-editor");
    fireEvent.change(within(editor).getByTestId("review-editor-text"), { target: { value: "quick" } });
    fireEvent.click(within(editor).getByTestId("review-editor-send"));
    await waitFor(() => expect(mockedSend).toHaveBeenCalledWith(RUN_ID, [expect.objectContaining({ text: "quick", line: 2 })]));
    await waitFor(() => expect(screen.getByTestId("review-comment")).toHaveAttribute("data-state", "sent"));
    expect(screen.getByTestId("review-toast")).toHaveTextContent("1 comment sent as one message.");
  });

  it("shows sent comments from the projected state on load and greys those of another pair in the sidebar", async () => {
    mockedRun.mockResolvedValue(
      makeRun({
        review_comments: [sentComment(), sentComment({ id: "rc-002", from_ref: "node:impl:1:before", to_ref: "node:impl:1:after", line: 1 })],
      }),
    );
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-comment")).toHaveLength(1));
    expect(screen.getAllByTestId("review-file")[0]).toHaveAttribute("data-sent", "1");
    const rows = screen.getAllByTestId("review-comment-row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveAttribute("data-other-pair", "true");
    expect(rows[1]).toHaveTextContent("at implement · iter 1 · before → implement · iter 1 · after");
    expect(screen.getByTestId("review-comments-pill")).toHaveTextContent("1 sent");
  });

  it("disables every send gesture with the reason when the Run branch is gone", async () => {
    mockedRefs.mockResolvedValue({ ...REFS, refs: REFS.refs.map((r) => (r.id === "tip" ? { ...r, sha: null } : r)) });
    render(<ReviewPage runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByTestId("review-file")).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("review-branch-gone")).toHaveTextContent(`pdo/run-${RUN_ID} no longer exists`));
    fireEvent.click(within(screen.getAllByTestId("review-file")[0]).getByTestId("mock-add-new-2"));
    const editor = await screen.findByTestId("review-comment-editor");
    fireEvent.change(within(editor).getByTestId("review-editor-text"), { target: { value: "late" } });
    expect(within(editor).getByTestId("review-editor-send")).toBeDisabled();
    expect(within(editor).getByTestId("review-editor-send")).toHaveAttribute("title", expect.stringContaining("no longer exists"));
    fireEvent.click(within(editor).getByTestId("review-editor-save"));
    await screen.findByTestId("review-comment");
    expect(screen.getByTestId("review-comment-send")).toBeDisabled();
    expect(screen.getByTestId("review-send-all")).toBeDisabled();
    expect(screen.getByTestId("review-send-pill")).toBeDisabled();
    expect(screen.getByTestId("review-send-bar-note")).toHaveTextContent("no longer exists");
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
