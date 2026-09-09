/**
 * Intra-line word highlighting for a `-`/`+` pair (#748, Diff tab). Pure and
 * DOM-free: tokenises both lines (words, runs of whitespace, single
 * punctuation), takes their LCS, and returns each side as segments flagged
 * `changed` where the token is not part of the common subsequence. Rendering
 * paints only the `changed` segments, so a dense unified diff reads without a
 * side-by-side view.
 *
 * Bounded: past `MAX_TOKENS` on either side the whole line is returned as one
 * unchanged segment (a minified bundle line would otherwise cost O(n²)).
 */

export interface WordSegment {
  text: string;
  changed: boolean;
}

export interface WordDiff {
  old: WordSegment[];
  new: WordSegment[];
}

const MAX_TOKENS = 400;

function tokenize(s: string): string[] {
  return s.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
}

/** Merge adjacent segments with the same flag so the DOM stays small. */
function coalesce(segs: WordSegment[]): WordSegment[] {
  const out: WordSegment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.changed === s.changed) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

export function wordDiff(oldLine: string, newLine: string): WordDiff {
  const a = tokenize(oldLine);
  const b = tokenize(newLine);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return {
      old: oldLine ? [{ text: oldLine, changed: false }] : [],
      new: newLine ? [{ text: newLine, changed: false }] : [],
    };
  }
  // LCS table, (a.length+1) × (b.length+1).
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array = new Uint16Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] =
        a[i] === b[j]
          ? dp[at(i + 1, j + 1)] + 1
          : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const oldSegs: WordSegment[] = [];
  const newSegs: WordSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      oldSegs.push({ text: a[i], changed: false });
      newSegs.push({ text: b[j], changed: false });
      i++;
      j++;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      oldSegs.push({ text: a[i], changed: true });
      i++;
    } else {
      newSegs.push({ text: b[j], changed: true });
      j++;
    }
  }
  for (; i < n; i++) oldSegs.push({ text: a[i], changed: true });
  for (; j < m; j++) newSegs.push({ text: b[j], changed: true });
  return { old: coalesce(oldSegs), new: coalesce(newSegs) };
}
