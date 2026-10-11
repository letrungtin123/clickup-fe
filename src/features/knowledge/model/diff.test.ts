import { describe, expect, it } from "vitest";

import type { RichTextDoc } from "@/contracts/rich-text";

import {
  collapseUnchanged,
  diffLines,
  diffSequences,
  diffStats,
  diffVersions,
  diffWords,
  docToLines,
  type DiffLine,
  type DiffOp
} from "./diff";

/** Rebuilds both sides from an edit script (the script must be complete and ordered). */
const apply = <T>(ops: DiffOp<T>[]) => ({
  before: ops.filter((op) => op.type !== "insert").flatMap((op) => op.items),
  after: ops.filter((op) => op.type !== "delete").flatMap((op) => op.items)
});

const edits = <T>(ops: DiffOp<T>[]) =>
  ops.filter((op) => op.type !== "equal").reduce((sum, op) => sum + op.items.length, 0);

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const h = (level: number, text: string) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const doc = (...content: object[]) => ({ type: "doc", content }) as RichTextDoc;

describe("diffSequences (Myers)", () => {
  it("returns a single equal run for identical input", () => {
    expect(diffSequences([..."abc"], [..."abc"])).toEqual([{ type: "equal", items: ["a", "b", "c"] }]);
  });

  it("handles empty sides", () => {
    expect(diffSequences([], [..."ab"])).toEqual([{ type: "insert", items: ["a", "b"] }]);
    expect(diffSequences([..."ab"], [])).toEqual([{ type: "delete", items: ["a", "b"] }]);
    expect(diffSequences([], [])).toEqual([]);
  });

  it("finds a minimal edit script (classic ABCABBA → CBABAC has distance 5)", () => {
    const a = [..."ABCABBA"];
    const b = [..."CBABAC"];
    const ops = diffSequences(a, b);
    expect(apply(ops)).toEqual({ before: a, after: b });
    expect(edits(ops)).toBe(5);
  });

  it("reconstructs both sides for random inputs and never does worse than replace-all", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 200; run += 1) {
      const a = Array.from({ length: Math.floor(random() * 12) }, () => "abcd"[Math.floor(random() * 4)] ?? "a");
      const b = Array.from({ length: Math.floor(random() * 12) }, () => "abcd"[Math.floor(random() * 4)] ?? "a");
      const ops = diffSequences(a, b);
      expect(apply(ops)).toEqual({ before: a, after: b });
      expect(edits(ops)).toBeLessThanOrEqual(a.length + b.length);
    }
  });

  it("keeps a common prefix and suffix as equal runs", () => {
    const ops = diffSequences([..."hello world"], [..."hello brave world"]);
    expect(ops[0]).toEqual({ type: "equal", items: [..."hello "] });
    expect(ops.at(-1)?.type).toBe("equal");
    expect(apply(ops).after.join("")).toBe("hello brave world");
  });
});

describe("diffWords", () => {
  it("highlights the replaced word only", () => {
    expect(diffWords("Bước 3: kiểm tra màu", "Bước 3: kiểm tra độ sáng")).toEqual([
      { type: "equal", text: "Bước 3: kiểm tra " },
      { type: "delete", text: "màu" },
      { type: "insert", text: "độ sáng" }
    ]);
  });
});

describe("docToLines", () => {
  it("flattens headings, paragraphs, nested lists, tasks, quotes and code", () => {
    const lines = docToLines(
      doc(
        h(2, "Quy trình"),
        p("Mở file  gốc"),
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [p("Bước 1"), { type: "orderedList", content: [{ type: "listItem", content: [p("Con")] }] }]
            }
          ]
        },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p("Đã kiểm")] }] },
        { type: "blockquote", content: [p("Lưu ý")] },
        { type: "codeBlock", content: [{ type: "text", text: "a\nb" }] },
        { type: "horizontalRule" },
        p("   ")
      )
    );
    expect(lines).toEqual<DiffLine[]>([
      { kind: "heading", text: "Quy trình", level: 2 },
      { kind: "paragraph", text: "Mở file gốc", level: 0 },
      { kind: "list", text: "Bước 1", level: 0 },
      { kind: "list", text: "Con", level: 1 },
      { kind: "task", text: "Đã kiểm", level: 0, checked: true },
      { kind: "quote", text: "Lưu ý", level: 0 },
      { kind: "code", text: "a", level: 0 },
      { kind: "code", text: "b", level: 0 },
      { kind: "rule", text: "", level: 0 }
    ]);
  });

  it("renders mentions as @label", () => {
    const lines = docToLines(
      doc({ type: "paragraph", content: [{ type: "text", text: "Hỏi " }, { type: "mention", attrs: { id: "x", label: "Linh" } }] })
    );
    expect(lines[0]?.text).toBe("Hỏi @Linh");
  });
});

describe("diffLines / diffVersions", () => {
  it("marks a reworded line as changed with word segments", () => {
    const rows = diffLines(
      [{ kind: "paragraph", text: "Gửi file cho khách trước 17h", level: 0 }],
      [{ kind: "paragraph", text: "Gửi file cho khách trước 16h", level: 0 }]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("changed");
  });

  it("shows unrelated replacements as removed + added", () => {
    const rows = diffLines(
      [{ kind: "paragraph", text: "Một câu hoàn toàn khác", level: 0 }],
      [{ kind: "paragraph", text: "Nội dung mới tinh", level: 0 }]
    );
    expect(rows.map((row) => row.type)).toEqual(["removed", "added"]);
  });

  it("compares title, summary and body and counts the changes", () => {
    const rows = diffVersions(
      { title: "Quy trình retouch", summary: null, body: doc(p("A"), p("B")) },
      { title: "Quy trình retouch v2", summary: "Tóm tắt", body: doc(p("A"), p("C"), p("D")) }
    );
    const stats = diffStats(rows);
    expect(stats.identical).toBe(false);
    expect(rows[0]).toMatchObject({ type: "changed" });
    expect(rows.some((row) => row.type === "added" && row.line.kind === "summary")).toBe(true);
    expect(diffStats(diffVersions({ title: "x", summary: null, body: doc(p("A")) }, { title: "x", summary: "", body: doc(p("A")) })).identical).toBe(true);
  });
});

describe("collapseUnchanged", () => {
  const same = (text: string) => ({ type: "same" as const, line: { kind: "paragraph" as const, text, level: 0 } });

  it("folds long unchanged runs and keeps context around changes", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, index) => same(`s${index}`)),
      { type: "added" as const, line: { kind: "paragraph" as const, text: "new", level: 0 } },
      ...Array.from({ length: 10 }, (_, index) => same(`t${index}`))
    ];
    const collapsed = collapseUnchanged(rows, 2);
    expect(collapsed[0]).toEqual({ type: "gap", count: 8, from: 0 });
    expect(collapsed.filter((row) => row.type === "same")).toHaveLength(4);
    expect(collapsed.at(-1)).toEqual({ type: "gap", count: 8, from: 13 });
    expect(collapseUnchanged(rows, 2, new Set([0])).filter((row) => row.type === "gap")).toHaveLength(1);
  });

  it("gives up on word highlights for a fully rewritten long paragraph (bounded time)", () => {
    const before = Array.from({ length: 3000 }, (_, index) => `cu${index}`).join(" ");
    const after = Array.from({ length: 3000 }, (_, index) => `moi${index}`).join(" ");
    const started = Date.now();
    const segments = diffWords(before, after);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(segments.map((segment) => segment.type)).toEqual(["delete", "insert"]);
    expect(segments[0]?.text).toBe(before);
    expect(segments[1]?.text).toBe(after);
  });
});
