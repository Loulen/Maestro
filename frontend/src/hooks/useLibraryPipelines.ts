import { useState, useEffect, useCallback } from "react";
import { fetchLibraryPipelines } from "../api";
import type { LibraryPipelineEntry } from "../api";

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
