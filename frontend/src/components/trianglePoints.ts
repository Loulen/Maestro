import type { PortSide } from "../types";

export function trianglePoints(
  kind: "input" | "output",
  side: PortSide,
): string {
  const inward = kind === "input";
  switch (side) {
    case "left":
      return inward ? "2,5 2,11 10,8" : "10,5 10,11 2,8";
    case "right":
      return inward ? "10,5 10,11 2,8" : "2,5 2,11 10,8";
    case "top":
      return inward ? "5,2 11,2 8,10" : "5,10 11,10 8,2";
    case "bottom":
      return inward ? "5,10 11,10 8,2" : "5,2 11,2 8,10";
  }
}
