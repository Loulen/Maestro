import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name: string;
  kind?: string;
  detail?: string;
}

export default function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  name,
  kind = "pipeline",
  detail,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      data-testid="confirm-delete-backdrop"
      onClick={onClose}
    >
      <div
        className="w-[360px] rounded-lg border border-line bg-bg-2 p-4 shadow-lg"
        style={{ fontSize: "12px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-medium text-fg" style={{ fontSize: "13px" }}>
          Delete this {kind}?
        </h3>
        <p className="mt-2 text-fg-2">
          <code className="rounded bg-bg-4 px-1 py-0.5 font-mono text-fg">
            {name}
          </code>
        </p>
        <p className="mt-2 text-fg-3" style={{ fontSize: "11.5px" }}>
          {detail ??
            "This will permanently remove the YAML file and its prompt files from disk. This action cannot be undone."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-line-strong bg-bg-3 px-3 py-1.5 text-fg-2 transition-colors hover:bg-bg-4"
            style={{ fontSize: "11.5px" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-st-failed px-3 py-1.5 text-white transition-colors hover:bg-st-failed/80"
            style={{ fontSize: "11.5px" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
