import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { ReactNodeViewRenderer, type AnyExtension, type Editor } from "@tiptap/react";
import { toast } from "sonner";

import { knowledgeCellMinWidth, knowledgeTableLimitMessages, knowledgeTableLimits } from "../model/body";
import { KnowledgeImageView } from "./image-view";

const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

/** Rows / columns of the table around the cursor (0 when outside a table). */
export const tableSize = (editor: Editor) => {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "table") return { rows: node.childCount, columns: node.firstChild?.childCount ?? 0 };
  }
  return { rows: 0, columns: 0 };
};

/**
 * Image block of knowledge bodies: `{ attachmentId, alt, width }` — the file is an attachment of the item
 * and its `src` is never stored; the node view resolves a short-lived signed URL at runtime. Only images
 * carrying an attachment id are parsed (pasted remote <img> tags are ignored; pasted files are uploaded).
 */
export const KnowledgeImage = Image.extend({
  name: "image",
  inline: false,
  group: "block",
  draggable: true,
  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.attachmentId ? { "data-attachment-id": text(attributes.attachmentId) } : {}
      },
      alt: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("alt"),
        renderHTML: (attributes: Record<string, unknown>) => (attributes.alt ? { alt: text(attributes.alt) } : {})
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = Number(element.getAttribute("data-width"));
          return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
        },
        renderHTML: (attributes: Record<string, unknown>) => (attributes.width ? { "data-width": text(attributes.width) } : {})
      }
    };
  },
  parseHTML() {
    return [{ tag: "img[data-attachment-id]" }];
  },
  addInputRules() {
    return [];
  },
  addNodeView() {
    return ReactNodeViewRenderer(KnowledgeImageView);
  }
});

/**
 * What a table cell may hold — the server's knowledge profile (contracts/rich-text.ts knowledgeBodySpec):
 * no images, tables, rules, code blocks or checklists inside cells, so the editor never builds what the
 * server would strip.
 */
const cellContent = "(paragraph | heading | bulletList | orderedList | blockquote)+";

/** Tab in the last cell adds a row — but never past the server's row limit (it explains instead). */
const KnowledgeTable = Table.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => {
        if (this.editor.commands.goToNextCell()) return true;
        if (!this.editor.isActive("table")) return false;
        if (tableSize(this.editor).rows >= knowledgeTableLimits.rows) {
          toast.info(knowledgeTableLimitMessages.rows);
          return true;
        }
        if (!this.editor.can().addRowAfter()) return false;
        return this.editor.chain().addRowAfter().goToNextCell().run();
      }
    };
  }
});

/** Tables (header row, Tab / Shift+Tab between cells, column widths by dragging) and images — knowledge editor only. */
export const knowledgeEditorExtensions: readonly AnyExtension[] = [
  KnowledgeTable.configure({ resizable: true, cellMinWidth: knowledgeCellMinWidth, handleWidth: 6 }),
  TableRow,
  TableHeader.extend({ content: cellContent }),
  TableCell.extend({ content: cellContent }),
  KnowledgeImage.configure({ inline: false, allowBase64: false })
];
