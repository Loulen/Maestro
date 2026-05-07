import { describe, it, expect } from "vitest";
import { trianglePoints } from "./TriangleHandle";
import type { PortSide } from "../types";

const SIDES: PortSide[] = ["left", "right", "top", "bottom"];
const KINDS = ["input", "output"] as const;

describe("trianglePoints", () => {
  it("returns a truthy string for all 8 (kind, side) combinations", () => {
    for (const kind of KINDS) {
      for (const side of SIDES) {
        const pts = trianglePoints(kind, side);
        expect(pts).toBeTruthy();
      }
    }
  });

  it("input left points inward (rightward toward body)", () => {
    const pts = trianglePoints("input", "left");
    expect(pts).toBe("2,5 2,11 10,8");
  });

  it("output left points outward (leftward away from body)", () => {
    const pts = trianglePoints("output", "left");
    expect(pts).toBe("10,5 10,11 2,8");
  });

  it("input right points inward (leftward toward body)", () => {
    const pts = trianglePoints("input", "right");
    expect(pts).toBe("10,5 10,11 2,8");
  });

  it("output right points outward (rightward away from body)", () => {
    const pts = trianglePoints("output", "right");
    expect(pts).toBe("2,5 2,11 10,8");
  });

  it("input top points inward (downward toward body)", () => {
    const pts = trianglePoints("input", "top");
    expect(pts).toBe("5,2 11,2 8,10");
  });

  it("output top points outward (upward away from body)", () => {
    const pts = trianglePoints("output", "top");
    expect(pts).toBe("5,10 11,10 8,2");
  });

  it("input bottom points inward (upward toward body)", () => {
    const pts = trianglePoints("input", "bottom");
    expect(pts).toBe("5,10 11,10 8,2");
  });

  it("output bottom points outward (downward away from body)", () => {
    const pts = trianglePoints("output", "bottom");
    expect(pts).toBe("5,2 11,2 8,10");
  });

  it("input and output on same side are mirror images", () => {
    for (const side of SIDES) {
      const inPts = trianglePoints("input", side);
      const outPts = trianglePoints("output", side);
      expect(inPts).not.toBe(outPts);
    }
  });
});
