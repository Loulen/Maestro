import { useEffect, useRef, useState } from "react";
import { Bot, Check, CheckCircle2, ChevronRight, Cpu, Hourglass, Lock, MessageSquare, Pencil, Trash2, Undo2, User } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AuthorKind, CommentState, ReviewEntry } from "../../lib/reviewComments";
import { anchorLabel, authorKind, authorLabel, commentState, firstWords, footerStatus, plural, relativeTime } from "../../lib/reviewComments";
import type { ReviewComment } from "../../types";

/**
 * One review comment rendered under its diff line (#750): a **draft** card
 * (amber `✎ Draft`, edit / delete on hover, footer "Only in this browser until
 * sent" + `↗ Send to manager` always visible), a **sending** card (greyed,
 * spinner, "starting the manager…" when the send has to start it), or a
 * **sent** card. No edit, no delete on a sent comment: it is a Run event.
 *
 * #751 — the sent card is a **thread**: the agent's replies stack between the
 * body and the footer, one row per reply (author icon — person you, bot
 * manager, chip + id for a node —, time, an hourglass when the reply proposes a
 * resolution, a blue dot while unread). State is one icon plus a 2px left
 * border on the header: message-square open (blue), hourglass **Resolution
 * proposed** (amber), check-circle resolved (green); no filled pills, names
 * live in tooltips. The footer carries the decision: `Resolve` on an open or
 * proposed comment, `Reopen` on a resolved one — and on a proposal, where it
 * declines it and keeps the comment open for the agent. A resolved card
 * **collapses** to one line (icon · anchor · time · first words · reply count ·
 * resolved-by); its header click expands it. A reply that lands live flashes
 * the card's outline for two seconds.
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
  /** #751 — sent cards only. Replies this browser has not seen yet (the last N rows). */
  unread?: number;
  /** A reply just landed over the WebSocket: outline flash. */
  flash?: boolean;
  /** A Resolve / Reopen request is in flight for this comment. */
  deciding?: boolean;
  onResolve?: () => void;
  onReopen?: () => void;
  /** The card was looked at (hovered, or in view for a moment): clear its unread dots. */
  onSeen?: () => void;
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
  unread = 0,
  flash = false,
  deciding = false,
  onResolve,
  onReopen,
  onSeen,
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
    return (
      <SentCard
        comment={entry.comment}
        label={label}
        body={body}
        pairLabel={pairLabel}
        unread={unread}
        flash={flash}
        deciding={deciding}
        onResolve={onResolve}
        onReopen={onReopen}
        onSeen={onSeen}
      />
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

const STATE_COLOR: Record<CommentState, string> = {
  open: "var(--color-st-running)",
  proposed: "var(--color-st-await)",
  resolved: "var(--color-st-done)",
};

/** How long a card has to stay in view before its replies count as seen. */
const SEEN_DWELL_MS = 1500;

function SentCard({
  comment: c,
  label,
  body,
  pairLabel,
  unread,
  flash,
  deciding,
  onResolve,
  onReopen,
  onSeen,
}: {
  comment: ReviewComment;
  label: string;
  body: (text: string) => React.ReactNode;
  pairLabel: string;
  unread: number;
  flash: boolean;
  deciding: boolean;
  onResolve?: () => void;
  onReopen?: () => void;
  onSeen?: () => void;
}) {
  const state = commentState(c);
  const replies = c.replies ?? [];
  const footer = footerStatus(c);
  // Resolved ⇒ collapsed (GitHub-like), until the header is clicked. The
  // expansion is keyed on the resolution it was opened for, so a comment
  // resolved again later collapses again without an effect.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const resolutionKey = c.resolved_at ?? "resolved";
  const collapsed = state === "resolved" && expandedFor !== resolutionKey;
  const setExpanded = (fn: (open: boolean) => boolean) =>
    setExpandedFor((prev) => (fn(prev === resolutionKey) ? resolutionKey : null));

  // Seen: hover, or in view for a moment. Only while something is unread.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (unread === 0 || !onSeen) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: number | undefined;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      window.clearTimeout(timer);
      if (visible) timer = window.setTimeout(() => onSeen(), SEEN_DWELL_MS);
    });
    io.observe(el);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [unread, onSeen]);

  const firstUnread = replies.length - unread;
  const resolver = c.resolved_by ?? "user";
  const stateTitle =
    state === "resolved"
      ? `Resolved by ${authorLabel(resolver)}`
      : state === "proposed"
        ? `Resolution proposed by ${authorLabel(footer.kind === "proposed" ? footer.author : "agent")}`
        : "Sent · open";

  return (
    <div
      ref={rootRef}
      onMouseEnter={unread > 0 ? onSeen : undefined}
      className={`group my-2 ml-3 mr-3 max-w-[720px] overflow-hidden rounded-md border border-line-strong bg-bg-2 font-sans ${
        flash ? "pdo-review-flash" : ""
      }`}
      style={{ fontSize: "11px", whiteSpace: "normal" }}
      data-testid="review-comment"
      data-state={c.status}
      data-review-state={state}
      data-collapsed={collapsed ? "true" : undefined}
      data-unread={unread > 0 ? unread : undefined}
      data-anchor={label}
      data-comment-id={c.id}
    >
      <div
        role={state === "resolved" ? "button" : undefined}
        tabIndex={state === "resolved" ? 0 : undefined}
        aria-expanded={state === "resolved" ? !collapsed : undefined}
        onClick={state === "resolved" ? () => setExpanded((e) => !e) : undefined}
        onKeyDown={
          state === "resolved"
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded((x) => !x);
                }
              }
            : undefined
        }
        data-testid="review-comment-header"
        className={`flex items-center gap-2 bg-bg-3 px-2.5 py-[5px] text-fg-3 ${collapsed ? "cursor-pointer" : "border-b border-line"}`}
        style={{ fontSize: "10.5px", borderLeft: `2px solid ${STATE_COLOR[state]}` }}
      >
        <StateIcon state={state} title={stateTitle} />
        <AuthorIcon author={c.author} />
        <span className="font-mono text-fg-4" style={{ fontSize: "10px" }}>
          {label}
        </span>
        <span className="text-fg-4">· {relativeTime(c.sent_at)}</span>
        {state === "resolved" && (
          <span className={`text-fg-4 transition-transform ${collapsed ? "" : "rotate-90"}`} aria-hidden>
            <ChevronRight size={10} />
          </span>
        )}
        {collapsed && (
          <span className="flex min-w-0 items-center gap-1.5 truncate text-fg-3" style={{ fontSize: "10px" }} data-testid="review-comment-summary">
            <span className="truncate">“{firstWords(c.text)}”</span>
            {replies.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-fg-4" title={plural(replies.length, "reply").replace("replys", "replies")}>
                <MessageSquare size={10} /> {replies.length}
              </span>
            )}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-fg-4">
          {state === "resolved" ? (
            <span className="inline-flex items-center gap-0.5 text-fg-4" title={`Resolved by ${authorLabel(resolver)}`} data-testid="review-comment-resolved-by">
              <AuthorGlyph kind={authorKind(resolver)} size={10} />
              <Check size={10} className="text-st-done" />
            </span>
          ) : (
            <span
              className="grid h-5 w-[22px] cursor-help place-items-center"
              title="Sent comments are Run events: immutable, readable post-mortem. Replies and Resolve / Reopen are events too."
              data-testid="review-comment-lock"
            >
              <Lock size={11} />
            </span>
          )}
        </span>
      </div>

      {!collapsed && (
        <>
          {body(c.text)}
          {replies.length > 0 && (
            <div className="border-t border-line bg-bg-1" data-testid="review-comment-thread">
              {replies.map((r, i) => {
                const kind = authorKind(r.author);
                const isUnread = i >= firstUnread;
                return (
                  <div
                    key={`${r.at}-${i}`}
                    className={`grid grid-cols-[14px_1fr] gap-2 px-2.5 py-[7px] ${i > 0 ? "border-t border-dashed border-line-soft" : ""}`}
                    data-testid="review-reply"
                    data-author={r.author}
                    data-unread={isUnread ? "true" : undefined}
                    data-proposes={r.proposes_resolution ? "true" : undefined}
                  >
                    <span className="mt-px text-fg-3" title={authorLabel(r.author)}>
                      <AuthorGlyph kind={kind} size={12} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-fg-3" style={{ fontSize: "10.5px" }}>
                        {kind === "node" && (
                          <span className="font-mono text-fg-2" style={{ fontSize: "10px" }} title={`node ${r.author}`}>
                            {r.author}
                          </span>
                        )}
                        <span className="text-fg-4">{relativeTime(r.at)}</span>
                        {r.proposes_resolution && (
                          <span className="inline-flex items-center text-st-await" title="Proposes to resolve" data-testid="review-reply-proposes">
                            <Hourglass size={10} />
                          </span>
                        )}
                        {isUnread && (
                          <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-st-running" title="New reply" data-testid="review-reply-unread" aria-label="new" />
                        )}
                      </div>
                      <div
                        className="artifact-markdown text-fg [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                        style={{ fontSize: "11.5px", lineHeight: 1.5 }}
                        data-testid="review-reply-body"
                      >
                        <Markdown remarkPlugins={REMARK_PLUGINS}>{r.text}</Markdown>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-line px-2.5 py-[5px] text-fg-4" style={{ fontSize: "10px" }}>
            <span className="font-mono" data-testid="review-comment-id">
              {c.id}
            </span>
            <span>· {pairLabel}</span>
            <span className="ml-auto inline-flex items-center gap-1.5" data-testid="review-comment-status" data-kind={footer.kind}>
              <FooterStatusView status={footer} />
              {state === "proposed" ? (
                <>
                  <DecisionButton
                    primary
                    onClick={onResolve}
                    disabled={deciding || !onResolve}
                    title={`Confirm: mark ${c.id} resolved (you keep Reopen)`}
                    testId="review-comment-resolve"
                  >
                    <Check size={11} /> Resolve
                  </DecisionButton>
                  <DecisionButton
                    onClick={onReopen}
                    disabled={deciding || !onReopen}
                    title="Decline the proposal, keep the comment open for the agent"
                    testId="review-comment-reopen"
                  >
                    <Undo2 size={11} /> Reopen
                  </DecisionButton>
                </>
              ) : state === "resolved" ? (
                <DecisionButton ghost onClick={onReopen} disabled={deciding || !onReopen} title="Reopen this comment" testId="review-comment-reopen">
                  <Undo2 size={11} /> Reopen
                </DecisionButton>
              ) : footer.kind !== "awaiting" ? (
                <DecisionButton ghost onClick={onResolve} disabled={deciding || !onResolve} title="Resolve this comment yourself" testId="review-comment-resolve">
                  <Check size={11} /> Resolve
                </DecisionButton>
              ) : null}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function FooterStatusView({ status }: { status: ReturnType<typeof footerStatus> }) {
  switch (status.kind) {
    case "awaiting":
      return (
        <>
          <Spinner dim />
          Awaiting manager reply
        </>
      );
    case "replied":
      return (
        <span className="inline-flex items-center gap-1" title={`Replied by ${authorLabel(status.author)}`}>
          <AuthorGlyph kind={authorKind(status.author)} size={10} /> {relativeTime(status.at)}
        </span>
      );
    case "proposed":
      return (
        <span className="inline-flex items-center gap-1 text-st-await" title={`Resolution proposed by ${authorLabel(status.author)}`}>
          <Hourglass size={10} />
          <AuthorGlyph kind={authorKind(status.author)} size={10} /> <span className="text-fg-4">{relativeTime(status.at)}</span>
        </span>
      );
    case "resolved":
      return (
        <span className="inline-flex items-center gap-1 text-st-done" title={`Resolved by ${authorLabel(status.by)}`}>
          <CheckCircle2 size={10} />
          <AuthorGlyph kind={authorKind(status.by)} size={10} /> <span className="text-fg-4">{relativeTime(status.at)}</span>
        </span>
      );
    case "reopened":
      return (
        <span className="inline-flex items-center gap-1" title={`Reopened by ${authorLabel(status.by)}`}>
          <Undo2 size={10} />
          <AuthorGlyph kind={authorKind(status.by)} size={10} /> {relativeTime(status.at)}
        </span>
      );
    case "declined":
      return (
        <span className="inline-flex items-center gap-1" title={`Proposal declined by ${authorLabel(status.by)} — open for the agent`}>
          <Undo2 size={10} />
          <AuthorGlyph kind={authorKind(status.by)} size={10} /> {relativeTime(status.at)}
        </span>
      );
  }
}

function DecisionButton({
  children,
  onClick,
  disabled,
  title,
  testId,
  primary,
  ghost,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled: boolean;
  title: string;
  testId: string;
  primary?: boolean;
  ghost?: boolean;
}) {
  const look = primary
    ? "border-acc bg-acc font-semibold text-[#04140d] hover:bg-[#14cf92]"
    : ghost
      ? "border-transparent bg-transparent text-fg-4 hover:bg-bg-4 hover:text-fg-2"
      : "border-line-strong bg-bg-3 text-fg-2 hover:bg-bg-4 hover:text-fg";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-45 ${look}`}
      style={{ fontSize: "10.5px" }}
    >
      {children}
    </button>
  );
}

/** The state icon — message-square open, hourglass proposed, check-circle resolved. */
export function StateIcon({ state, title, size = 12 }: { state: CommentState; title?: string; size?: number }) {
  const cls = state === "proposed" ? "text-st-await" : state === "resolved" ? "text-st-done" : "text-fg-3";
  return (
    <span className={`inline-flex items-center ${cls}`} title={title} data-testid={`review-state-${state}`}>
      {state === "proposed" ? <Hourglass size={size} /> : state === "resolved" ? <CheckCircle2 size={size} /> : <MessageSquare size={size} />}
    </span>
  );
}

/** The author icon — person you, bot manager, chip node — name in the tooltip. */
export function AuthorIcon({ author, size = 12 }: { author: string; size?: number }) {
  const kind = authorKind(author);
  return (
    <span className="inline-flex items-center gap-1 text-fg-3" title={authorLabel(author)} data-testid="review-author" data-author-kind={kind}>
      <AuthorGlyph kind={kind} size={size} />
      {kind === "node" && (
        <span className="font-mono text-fg-2" style={{ fontSize: "10px" }}>
          {author}
        </span>
      )}
    </span>
  );
}

export function AuthorGlyph({ kind, size }: { kind: AuthorKind; size: number }) {
  return kind === "user" ? <User size={size} /> : kind === "manager" ? <Bot size={size} /> : <Cpu size={size} />;
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
