import { describe, it, expect } from "vitest";
import { wordDiff } from "./wordDiff";

const joined = (segs: { text: string }[]) => segs.map((s) => s.text).join("");
const changed = (segs: { text: string; changed: boolean }[]) =>
  segs.filter((s) => s.changed).map((s) => s.text);

describe("wordDiff", () => {
  it("round-trips both lines", () => {
    const d = wordDiff("let a = 1;", "const a = 2;");
    expect(joined(d.old)).toBe("let a = 1;");
    expect(joined(d.new)).toBe("const a = 2;");
  });

  it("flags only the changed words", () => {
    const d = wordDiff("let a = 1;", "const a = 2;");
    expect(changed(d.old)).toEqual(["let", "1"]);
    expect(changed(d.new)).toEqual(["const", "2"]);
  });

  it("marks nothing when the lines are identical", () => {
    const d = wordDiff("same()", "same()");
    expect(changed(d.old)).toEqual([]);
    expect(changed(d.new)).toEqual([]);
  });

  it("marks everything when nothing is shared", () => {
    const d = wordDiff("abc", "xyz");
    expect(changed(d.old)).toEqual(["abc"]);
    expect(changed(d.new)).toEqual(["xyz"]);
  });

  it("treats whitespace runs as tokens so indentation changes show", () => {
    const d = wordDiff("  x", "    x");
    expect(changed(d.new)).toEqual(["    "]);
  });

  it("handles an empty side", () => {
    const d = wordDiff("", "new");
    expect(d.old).toEqual([]);
    expect(changed(d.new)).toEqual(["new"]);
  });

  it("gives up (no highlight) on very long lines instead of blowing up", () => {
    const long = Array.from({ length: 1000 }, (_, i) => `t${i}`).join(" ");
    const d = wordDiff(long, long + " x");
    expect(d.old).toEqual([{ text: long, changed: false }]);
    expect(d.new[0].changed).toBe(false);
  });
});
