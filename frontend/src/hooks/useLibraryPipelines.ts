import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchLibraryPipelines } from "../api";
import type { LibraryPipelineEntry } from "../api";
import type { PipelineDef } from "../types";
import { serializePipeline } from "../stores/editStore";

export type PipelineLibrarySyncState = "outline" | "synced" | "diverged";

// Compare two YAMLs while ignoring canvas-only diffs:
//   - `view: { x, y }` coordinates,
//   - trailing whitespace on each line,
//   - blank lines.
// Library pipelines don't carry layout, so the canvas can freely rearrange
// nodes without that registering as "diverged".
export function normalizePipelineYaml(yaml: string): string {
  return yaml
    .split("\n")
    .map((line) => line.replace(/\s*view:\s*\{[^}]*\}\s*$/u, "").trimEnd())
    .filter((line) => line.length > 0)
    .join("\n");
}

// Prompts live in `<id>.prompts/<node_id>.md` on disk, separate from the
// pipeline YAML. The YAML hash alone wouldn't notice prompt-only edits, so we
// compare the prompt maps in parallel: any node whose canvas content differs
// from the library copy counts as divergence (including missing-on-either-side
// nodes — an empty string and an absent file are treated the same to avoid
// false divergence right after a fresh save).
function promptsEqual(
  canvas: Record<string, string>,
  library: Record<string, string>,
): boolean {
  const keys = new Set([...Object.keys(canvas), ...Object.keys(library)]);
  for (const key of keys) {
    if ((canvas[key] ?? "") !== (library[key] ?? "")) return false;
  }
  return true;
}

/// Look up a library entry first by stable id (preferred — survives renames),
/// then by name as a fallback for the first time a tab encounters its library
/// twin. Callers should lock-in the resolved id on the tab so future renames
/// don't fall back to the (now-mismatching) name path.
export function computePipelineSyncState(
  pipelineYaml: string,
  entries: LibraryPipelineEntry[],
  pipelineName: string,
  libraryId?: string | null,
  canvasPrompts?: Record<string, string>,
): { state: PipelineLibrarySyncState; entry: LibraryPipelineEntry | null } {
  const byId = libraryId ? entries.find((e) => e.id === libraryId) ?? null : null;
  const entry = byId ?? entries.find((e) => e.name === pipelineName) ?? null;
  if (!entry) return { state: "outline", entry: null };
  const yamlMatches =
    normalizePipelineYaml(pipelineYaml) === normalizePipelineYaml(entry.yaml);
  const promptsMatch = promptsEqual(canvasPrompts ?? {}, entry.prompts ?? {});
  if (yamlMatches && promptsMatch) {
    return { state: "synced", entry };
  }
  return { state: "diverged", entry };
}

export function usePipelineLibraryState(
  pipeline: PipelineDef | null,
  entries: LibraryPipelineEntry[],
  libraryId?: string | null,
  prompts?: Record<string, string>,
): { state: PipelineLibrarySyncState; entry: LibraryPipelineEntry | null } {
  return useMemo(() => {
    if (!pipeline) return { state: "outline", entry: null };
    const yaml = serializePipeline(pipeline);
    return computePipelineSyncState(yaml, entries, pipeline.name, libraryId, prompts);
  }, [pipeline, entries, libraryId, prompts]);
}

export function useLibraryPipelines() {
  const [entries, setEntries] = useState<LibraryPipelineEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await fetchLibraryPipelines());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchLibraryPipelines()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { entries, loading, refresh };
}
