import { asRichTextDoc, type RichTextDocLike } from "@/components/shared/rich-text/helpers";
import type { RichTextNode } from "@/contracts/rich-text";

import { imageText, tableRowsText } from "./body";

/**
 * Readable comparison of two versions of a knowledge item (PD-031: "phần thêm xanh, phần bỏ đỏ").
 * Rich text is flattened into one line per text block (heading, paragraph, list item, code line…), the
 * lines are diffed with Myers' O(ND) algorithm, and a removed line directly replaced by an added one is
 * shown as one "changed" line with word-level highlights. No dependency, pure, unit-tested.
 */

export type DiffOpType = "equal" | "insert" | "delete";
export type DiffOp<T> = { type: DiffOpType; items: T[] };

/** Above this many edits the middle part is reported as "all removed / all added" (bounded memory). */
const maxEditDistance = 4000;
/**
 * Word-level highlights inside one line: a few hundred edits at most (memory grows with the square of the
 * edit distance, so a fully rewritten long paragraph would take seconds); beyond it the line is shown as
 * removed + added (KB-SEC FE-08).
 */
const maxWordEditDistance = 300;

/**
 * Shortest edit script between `a` and `b` (Myers 1986), as runs of equal / deleted / inserted items in
 * order. Common prefix and suffix are trimmed first, so the usual "small edit in a long text" is cheap.
 */
export const diffSequences = <T>(
  a: readonly T[],
  b: readonly T[],
  equals: (left: T, right: T) => boolean = (left, right) => left === right,
  maxDistance = maxEditDistance
): DiffOp<T>[] => {
  let start = 0;
  while (start < a.length && start < b.length && equals(a[start] as T, b[start] as T)) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && equals(a[endA - 1] as T, b[endB - 1] as T)) {
    endA -= 1;
    endB -= 1;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const middle = myers(midA, midB, equals, maxDistance) ?? fallback(midA, midB);

  const result: DiffOp<T>[] = [];
  const push = (type: DiffOpType, item: T) => {
    const last = result.at(-1);
    if (last && last.type === type) last.items.push(item);
    else result.push({ type, items: [item] });
  };
  for (let index = 0; index < start; index += 1) push("equal", a[index] as T);
  for (const op of middle) push(op.type, op.item);
  for (let index = endA; index < a.length; index += 1) push("equal", a[index] as T);
  return result;
};

const fallback = <T>(a: readonly T[], b: readonly T[]) => [
  ...a.map((item) => ({ type: "delete" as const, item })),
  ...b.map((item) => ({ type: "insert" as const, item }))
];

/** Myers forward search with a per-round snapshot of V for the backtrack; null when too far apart. */
const myers = <T>(
  a: readonly T[],
  b: readonly T[],
  equals: (left: T, right: T) => boolean,
  maxDistance: number
): { type: DiffOpType; item: T }[] | null => {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((item) => ({ type: "insert", item }));
  if (m === 0) return a.map((item) => ({ type: "delete", item }));
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  v[offset + 1] = 0;
  const trace: Int32Array[] = [];
  let found = -1;

  for (let d = 0; d <= max; d += 1) {
    if (d > maxDistance) return null;
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && equals(a[x] as T, b[y] as T)) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    // Snapshot of k ∈ [-d, d] (index k + d).
    trace.push(v.slice(offset - d, offset + d + 1));
    if (found !== -1) break;
  }

  const reversed: { type: DiffOpType; item: T }[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d -= 1) {
    const previous = trace[d - 1];
    if (!previous) break;
    const at = (k: number) => previous[k + (d - 1)] ?? 0;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    const moveX = down ? prevX : prevX + 1;
    const moveY = down ? prevY + 1 : prevY;
    while (x > moveX && y > moveY) {
      reversed.push({ type: "equal", item: a[x - 1] as T });
      x -= 1;
      y -= 1;
    }
    if (down) reversed.push({ type: "insert", item: b[prevY] as T });
    else reversed.push({ type: "delete", item: a[prevX] as T });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    reversed.push({ type: "equal", item: a[x - 1] as T });
    x -= 1;
    y -= 1;
  }
  return reversed.reverse();
};

// --- Rich text → lines ------------------------------------------------------------------------------

export type LineKind = "title" | "summary" | "heading" | "paragraph" | "list" | "task" | "quote" | "code" | "rule" | "table" | "image";

export type DiffLine = {
  kind: LineKind;
  text: string;
  /** Heading level (1–3) or list nesting depth (0+). */
  level: number;
  /** Task list items. */
  checked?: boolean;
};

const inlineText = (nodes: RichTextNode[] | undefined): string =>
  (nodes ?? [])
    .map((node) => {
      if (node.type === "text") return node.text ?? "";
      if (node.type === "hardBreak") return " ";
      if (node.type === "mention") {
        const label = node.attrs?.label;
        return `@${typeof label === "string" ? label : ""}`;
      }
      return inlineText(node.content);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

/** One line per text block, in reading order (empty paragraphs are dropped). */
export const docToLines = (input: RichTextDocLike | null | undefined): DiffLine[] => {
  const doc = asRichTextDoc(input);
  const lines: DiffLine[] = [];
  const blocks = (nodes: RichTextNode[] | undefined, context: { quote: boolean; depth: number }) => {
    for (const node of nodes ?? []) {
      switch (node.type) {
        case "paragraph": {
          const text = inlineText(node.content);
          if (text) lines.push({ kind: context.quote ? "quote" : "paragraph", text, level: 0 });
          break;
        }
        case "heading": {
          const level = node.attrs?.level === 1 || node.attrs?.level === 3 ? node.attrs.level : 2;
          const text = inlineText(node.content);
          if (text) lines.push({ kind: "heading", text, level });
          break;
        }
        case "bulletList":
        case "orderedList":
        case "taskList":
          for (const item of node.content ?? []) {
            const [first, ...rest] = item.content ?? [];
            const text = first?.type === "paragraph" ? inlineText(first.content) : "";
            const task = item.type === "taskItem";
            lines.push({
              kind: task ? "task" : "list",
              text,
              level: context.depth,
              ...(task ? { checked: item.attrs?.checked === true } : {})
            });
            blocks(first?.type === "paragraph" ? rest : item.content, { ...context, depth: context.depth + 1 });
          }
          break;
        case "blockquote":
          blocks(node.content, { ...context, quote: true });
          break;
        case "codeBlock": {
          const code = (node.content ?? []).map((child) => child.text ?? "").join("");
          for (const line of code.split("\n")) lines.push({ kind: "code", text: line, level: 0 });
          break;
        }
        case "horizontalRule":
          lines.push({ kind: "rule", text: "", level: 0 });
          break;
        case "table":
          for (const row of tableRowsText(node)) lines.push({ kind: "table", text: row, level: 0 });
          break;
        case "image":
          lines.push({ kind: "image", text: imageText(node), level: 0 });
          break;
        default:
          blocks(node.content, context);
      }
    }
  };
  blocks(doc?.content, { quote: false, depth: 0 });
  return lines;
};

const lineKey = (line: DiffLine) =>
  `${line.kind}|${line.level}|${line.checked === undefined ? "" : line.checked ? "x" : "o"}|${line.text}`;

// --- Line + word diff -------------------------------------------------------------------------------

export type WordSegment = { type: DiffOpType; text: string };

export type DiffRow =
  | { type: "same"; line: DiffLine }
  | { type: "added"; line: DiffLine }
  | { type: "removed"; line: DiffLine }
  | { type: "changed"; before: DiffLine; after: DiffLine; segments: WordSegment[] };

/** Words and the whitespace between them, so joining the tokens gives the text back. */
export const tokenizeWords = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

/** Word-level diff of one line; consecutive segments of the same type are merged. */
export const diffWords = (before: string, after: string): WordSegment[] => {
  const ops = diffSequences(tokenizeWords(before), tokenizeWords(after), undefined, maxWordEditDistance);
  return ops.map((op) => ({ type: op.type, text: op.items.join("") }));
};

/** Share of characters kept unchanged — below ~35 % a line reads better as removed + added. */
const similarity = (segments: readonly WordSegment[]) => {
  let same = 0;
  let total = 0;
  for (const segment of segments) {
    const length = segment.text.trim().length;
    total += length;
    if (segment.type === "equal") same += length;
  }
  return total === 0 ? 1 : same / total;
};

export const diffLines = (before: readonly DiffLine[], after: readonly DiffLine[]): DiffRow[] => {
  const ops = diffSequences(before, after, (left, right) => lineKey(left) === lineKey(right));
  const rows: DiffRow[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index];
    if (!op) continue;
    if (op.type === "equal") {
      for (const line of op.items) rows.push({ type: "same", line });
      continue;
    }
    const next = ops[index + 1];
    if (next && next.type !== "equal" && next.type !== op.type) {
      const removed = op.type === "delete" ? op.items : next.items;
      const added = op.type === "insert" ? op.items : next.items;
      const paired = Math.min(removed.length, added.length);
      for (let pair = 0; pair < paired; pair += 1) {
        const left = removed[pair] as DiffLine;
        const right = added[pair] as DiffLine;
        const segments = diffWords(left.text, right.text);
        if (left.kind === right.kind && similarity(segments) >= 0.35) {
          rows.push({ type: "changed", before: left, after: right, segments });
        } else {
          rows.push({ type: "removed", line: left }, { type: "added", line: right });
        }
      }
      for (const line of removed.slice(paired)) rows.push({ type: "removed", line });
      for (const line of added.slice(paired)) rows.push({ type: "added", line });
      index += 1;
      continue;
    }
    for (const line of op.items) rows.push({ type: op.type === "insert" ? "added" : "removed", line });
  }
  return rows;
};

export type VersionSnapshot = {
  title: string;
  summary: string | null;
  body: RichTextDocLike | null | undefined;
};

const snapshotLines = (snapshot: VersionSnapshot): DiffLine[] => [
  { kind: "title", text: snapshot.title.trim(), level: 0 },
  ...(snapshot.summary?.trim() ? [{ kind: "summary" as const, text: snapshot.summary.trim(), level: 0 }] : []),
  ...docToLines(snapshot.body)
];

/** Rows comparing two versions (title, summary, then the body). */
export const diffVersions = (before: VersionSnapshot, after: VersionSnapshot) =>
  diffLines(snapshotLines(before), snapshotLines(after));

export const diffStats = (rows: readonly DiffRow[]) => {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const row of rows) {
    if (row.type === "added") added += 1;
    else if (row.type === "removed") removed += 1;
    else if (row.type === "changed") changed += 1;
  }
  return { added, removed, changed, identical: added + removed + changed === 0 };
};

export type CollapsedRow = DiffRow | { type: "gap"; count: number; from: number };

/**
 * Keeps `context` unchanged lines around every change and folds longer unchanged runs into one
 * "… N dòng không đổi" row (expandable by index).
 */
export const collapseUnchanged = (
  rows: readonly DiffRow[],
  context = 2,
  expanded: ReadonlySet<number> = new Set()
): CollapsedRow[] => {
  const keep = rows.map((row) => row.type !== "same");
  const near = rows.map((_, index) => {
    for (let offset = -context; offset <= context; offset += 1) {
      if (keep[index + offset]) return true;
    }
    return false;
  });
  const result: CollapsedRow[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index] as DiffRow;
    if (near[index] || row.type !== "same") {
      result.push(row);
      index += 1;
      continue;
    }
    const from = index;
    while (index < rows.length && !near[index] && rows[index]?.type === "same") index += 1;
    const count = index - from;
    if (expanded.has(from) || count <= 1) {
      for (let cursor = from; cursor < index; cursor += 1) result.push(rows[cursor] as DiffRow);
    } else {
      result.push({ type: "gap", count, from });
    }
  }
  return result;
};
