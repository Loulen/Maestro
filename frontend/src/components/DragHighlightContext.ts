import { createContext, useContext } from "react";

const DragHighlightCtx = createContext<string | null>(null);

export const DragHighlightProvider = DragHighlightCtx.Provider;

export function useDragHighlightNode(): string | null {
  return useContext(DragHighlightCtx);
}
