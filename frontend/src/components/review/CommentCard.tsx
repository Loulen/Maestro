import { Lock, Pencil, Trash2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReviewEntry } from "../../lib/reviewComments";
import { anchorLabel, relativeTime } from "../../lib/reviewComments";

/**
 * One review comment rendered under its diff line (#750): a **draft** card
 * (amber `✎ Draft`, edit / delete on hover, footer "Only in this browser until
 * sent" + `↗ Send to manager` always visible), a **sending** card (greyed,
 * spinner, "starting the manager…" when the send has to start it), or a
 * **sent** card (blue `↗ Sent`, lock, footer `rc-002 · fork → tip · Awaiting
 * manager reply` — the slot where #751's replies land). No edit, no delete on
 * a sent comment: it is a Run event.
 */

interface Props {
  entry: ReviewEntry;
  /** True while this draft travels in a send. */
  sending: boolean;
  /** The send is starting the manager first (message nuance while sending). */
  startingManager: boolean;
  /** Labels of the pair for the sent footer (`Fork point → Run tip`). */
  pairLabel: string;
  sendDisabledReason: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onSend: () => void;
}

const REMARK_PLUGINS = [remarkGfm];

export default function CommentCard({
  entry,
  sending,
  startingManager,
  pairLabel,
  sendDisabledReason,
  onEdit,
  onDelete,
  onSend,
}: Props) {
  const label = anchorLabel(entry.anchor);
  const body = (text: string) => (
    <div
      className="artifact-markdown px-2.5 py-2 text-fg [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      style={{ fontSize: "11.5px", lineHeight: 1.5 }}
      data-testid="review-comment-body"
    >
      <Markdown remarkPlugins={REMARK_PLUGINS}>{text}</Markdown>
    </div>
  );

  if (entry.kind === "sent") {
    const c = entry.comment;
    return (
      <div
        className="group my-2 ml-3 mr-3 max-w-[720px] overflow-hidden rounded-md border border-line-strong bg-bg-2 font-sans"
        style={{ fontSize: "11px", whiteSpace: "normal" }}
        data-testid="review-comment"
        data-state={c.status}
        data-anchor={label}
        data-comment-id={c.id}
      >
        <div
          className="flex items-center gap-2 border-b border-line px-2.5 py-[5px] text-fg-3"
          style={{ fontSize: "10.5px", background: "rgba(59,130,246,.07)" }}
        >
          <Badge kind="sent">↗ Sent</Badge>
          <span className="font-medium text-fg-2">{c.author === "user" ? "you" : c.author}</span>
          <span className="font-mono text-fg-4" style={{ fontSize: "10px" }}>
            {label}
          </span>
          <span className="text-fg-4">· {relativeTime(c.sent_at)}</span>
          <span
            className="ml-auto grid h-5 w-[22px] cursor-help place-items-center text-fg-4"
            title="Sent comments are Run events: immutable, readable post-mortem. Replies and Resolve/Reopen arrive with the next ticket."
            data-testid="review-comment-lock"
          >
            <Lock size={11} />
          </span>
        </div>
        {body(c.text)}
        <div className="flex items-center gap-2 border-t border-line px-2.5 py-[5px] text-fg-4" style={{ fontSize: "10px" }}>
          <span className="font-mono" data-testid="review-comment-id">
            {c.id}
          </span>
          <span>· {pairLabel}</span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            {c.status === "resolved" ? (
              <span className="text-st-done">Resolved</span>
            ) : (
              <>
                <Spinner dim />
                Awaiting manager reply
              </>
            )}
          </span>
        </div>
      </div>
    );
  }

  const d = entry.draft;
  if (sending) {
    return (
      <div
        className="my-2 ml-3 mr-3 max-w-[720px] overflow-hidden rounded-md border border-line-strong bg-bg-2 font-sans opacity-70"
        style={{ fontSize: "11px", whiteSpace: "normal" }}
        data-testid="review-comment"
        data-state="sending"
        data-anchor={label}
      >
        <div className="flex items-center gap-2 border-b border-line bg-bg-3 px-2.5 py-[5px] text-fg-3" style={{ fontSize: "10.5px" }}>
          <Badge kind="sent">
            <Spinner /> Sending
          </Badge>
          <span className="font-medium text-fg-2">you</span>
          <span className="font-mono text-fg-4" style={{ fontSize: "10px" }}>
            {label}
          </span>
          <span className="text-fg-4">· {startingManager ? "starting the manager…" : "handing over…"}</span>
        </div>
        {body(d.text)}
      </div>
    );
  }

  return (
    <div
      className="group my-2 ml-3 mr-3 max-w-[720px] overflow-hidden rounded-md border border-line-strong bg-bg-2 font-sans"
      style={{ fontSize: "11px", whiteSpace: "normal" }}
      data-testid="review-comment"
      data-state="draft"
      data-anchor={label}
    >
      <div className="flex items-center gap-2 border-b border-line bg-bg-3 px-2.5 py-[5px] text-fg-3" style={{ fontSize: "10.5px" }}>
        <Badge kind="draft">✎ Draft</Badge>
        <span className="font-medium text-fg-2">you</span>
        <span className="font-mono text-fg-4" style={{ fontSize: "10px" }}>
          {label}
        </span>
        <span className="text-fg-4">· {relativeTime(d.updated_at)}</span>
        <span className="ml-auto inline-flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            title="Edit draft"
            data-testid="review-comment-edit"
            className="grid h-5 w-[22px] cursor-pointer place-items-center rounded text-fg-4 hover:bg-bg-4 hover:text-fg-2"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete draft"
            data-testid="review-comment-delete"
            className="grid h-5 w-[22px] cursor-pointer place-items-center rounded text-fg-4 hover:bg-bg-4 hover:text-st-failed"
          >
            <Trash2 size={11} />
          </button>
        </span>
      </div>
      {body(d.text)}
      <div className="flex items-center gap-2 border-t border-line px-2.5 py-[5px] text-fg-4" style={{ fontSize: "10px" }}>
        <span>Only in this browser until sent.</span>
        <span className="ml-auto">
          <button
            type="button"
            onClick={onSend}
            disabled={!!sendDisabledReason}
            title={sendDisabledReason ?? "Send this comment to the manager (one message)"}
            data-testid="review-comment-send"
            className="cursor-pointer rounded border border-line-strong bg-bg-3 px-2 py-0.5 text-fg-2 hover:bg-bg-4 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
            style={{ fontSize: "10.5px" }}
          >
            ↗ Send to manager
          </button>
        </span>
      </div>
    </div>
  );
}

/** The amber (draft) / blue (sent) pill the badges, sidebar and headers share. */
export function Badge({ kind, children, title }: { kind: "draft" | "sent"; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex h-[14px] items-center gap-[3px] rounded-[7px] px-[5px] font-medium ${
        kind === "draft" ? "bg-st-await-bg text-st-await" : "bg-st-running-bg text-st-running"
      }`}
      style={{ fontSize: "9.5px" }}
      data-testid={`review-badge-${kind}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ dim }: { dim?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[9px] w-[9px] animate-spin rounded-full border-[1.5px] border-fg-4"
      style={{ borderTopColor: dim ? "var(--color-fg-3)" : "var(--color-st-running)" }}
    />
  );
}
