import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchArtifact } from "../api";
import type { FileInfo } from "../api";

interface Props {
  runId: string;
  portName: string;
  files: FileInfo[];
  onClose: () => void;
}

export default function MarkdownArtifactModal({
  runId,
  portName,
  files,
  onClose,
}: Props) {
  const [index, setIndex] = useState(0);
  const file = files[index];
  const total = files.length;
  const isRepeated = total > 1;

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!file?.exists) {
        if (!cancelled) {
          setContent(null);
          setLoading(false);
        }
        return;
      }
      try {
        const text = await fetchArtifact(runId, file.path);
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setContent(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, file?.path, file?.exists]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (isRepeated && e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
      if (isRepeated && e.key === "ArrowRight" && index < total - 1)
        setIndex(index + 1);
    },
    [onClose, isRepeated, index, total],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const frontmatter = file?.frontmatter;
  const bodyContent = content ? stripFrontmatter(content) : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: "rgba(5,7,10,0.66)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[80vh] w-[560px] flex-col overflow-hidden rounded-lg border border-line-strong bg-bg-2"
        style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-fg" style={{ fontSize: "13px" }}>
              {portName}
            </span>
            {file?.path && (
              <span
                className="font-mono text-fg-4"
                style={{ fontSize: "10px" }}
              >
                {file.path}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isRepeated && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIndex(Math.max(0, index - 1))}
                  disabled={index === 0}
                  className="rounded p-0.5 text-fg-3 hover:bg-bg-3 hover:text-fg disabled:text-fg-5"
                >
                  <ChevronLeft size={14} />
                </button>
                <span
                  className="font-mono text-fg-3"
                  style={{ fontSize: "11px" }}
                >
                  iter {index + 1} of {total}
                </span>
                <button
                  onClick={() => setIndex(Math.min(total - 1, index + 1))}
                  disabled={index === total - 1}
                  className="rounded p-0.5 text-fg-3 hover:bg-bg-3 hover:text-fg disabled:text-fg-5"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="rounded p-1 text-fg-3 hover:bg-bg-3 hover:text-fg"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {/* Frontmatter card */}
          {frontmatter && Object.keys(frontmatter).length > 0 && (
            <div
              className="mb-3 grid rounded border border-line bg-bg-0 p-2 font-mono"
              style={{
                fontSize: "10.5px",
                gridTemplateColumns: "auto 1fr",
                gap: "4px 10px",
              }}
            >
              {Object.entries(frontmatter).map(([k, v]) => (
                <FrontmatterRow key={k} field={k} value={v} />
              ))}
            </div>
          )}

          {/* Markdown body */}
          {loading ? (
            <span className="text-fg-4" style={{ fontSize: "11px" }}>
              Loading...
            </span>
          ) : bodyContent ? (
            <div className="artifact-markdown prose-sm">
              <Markdown remarkPlugins={[remarkGfm]}>{bodyContent}</Markdown>
            </div>
          ) : (
            <span className="text-fg-4" style={{ fontSize: "11px" }}>
              {file?.exists ? "Could not load content." : "File does not exist yet."}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FrontmatterRow({ field, value }: { field: string; value: unknown }) {
  const display =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return (
    <>
      <span className="text-fg-3">{field}</span>
      <span className="text-fg">{display}</span>
    </>
  );
}

function stripFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return content;
  const after = trimmed.slice(3);
  const end = after.indexOf("\n---");
  if (end === -1) return content;
  return after.slice(end + 4).trimStart();
}
