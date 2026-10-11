import { useEditorState, type Editor } from "@tiptap/react";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  ImagePlus,
  Loader2,
  PanelTop,
  Rows3,
  Table2,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2
} from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { ToolbarDivider, ToolButton } from "@/components/shared/rich-text/editor-toolbar";

import { knowledgeTableLimitMessages, knowledgeTableLimits } from "../model/body";
import { tableSize } from "./extensions";

/**
 * Knowledge-only toolbar blocks: insert a table (3×3 with a header row) or an image; while the cursor is
 * in a table, row / column controls appear. Tab / Shift+Tab move between cells (Tab in the last cell
 * adds a row).
 */
export const KnowledgeToolbarExtras = ({
  editor,
  onPickImages,
  uploading,
  disabled
}: {
  editor: Editor;
  onPickImages: (files: File[]) => void;
  uploading: boolean;
  disabled?: boolean | undefined;
}) => {
  const input = useRef<HTMLInputElement | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      inTable: current.isActive("table"),
      canAddRow: current.can().addRowAfter(),
      canAddColumn: current.can().addColumnAfter(),
      canDeleteRow: current.can().deleteRow(),
      canDeleteColumn: current.can().deleteColumn(),
      ...tableSize(current)
    })
  });
  const chain = () => editor.chain().focus();
  const { rows, columns } = state;
  const rowsFull = rows >= knowledgeTableLimits.rows;
  const columnsFull = columns >= knowledgeTableLimits.columns;

  return (
    <>
      <ToolButton
        icon={Table2}
        label="Chèn bảng"
        disabled={disabled || state.inTable}
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />
      <ToolButton
        icon={uploading ? Loader2 : ImagePlus}
        label={uploading ? "Đang tải ảnh…" : "Chèn ảnh"}
        disabled={disabled || uploading}
        onClick={() => input.current?.click()}
      />
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        multiple
        hidden
        onChange={(event) => {
          onPickImages(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {state.inTable ? (
        <>
          <ToolbarDivider />
          {/* At a limit the button stays reachable and says why nothing is added. */}
          <ToolButton
            icon={BetweenHorizontalEnd}
            label={rowsFull ? `Thêm hàng (đã đủ ${knowledgeTableLimits.rows} hàng)` : "Thêm hàng bên dưới"}
            disabled={disabled || !state.canAddRow}
            onClick={() => (rowsFull ? toast.info(knowledgeTableLimitMessages.rows) : chain().addRowAfter().run())}
          />
          <ToolButton
            icon={BetweenVerticalEnd}
            label={columnsFull ? `Thêm cột (đã đủ ${knowledgeTableLimits.columns} cột)` : "Thêm cột bên phải"}
            disabled={disabled || !state.canAddColumn}
            onClick={() => (columnsFull ? toast.info(knowledgeTableLimitMessages.columns) : chain().addColumnAfter().run())}
          />
          <ToolButton icon={TableRowsSplit} label="Xoá hàng" disabled={disabled || !state.canDeleteRow} onClick={() => chain().deleteRow().run()} />
          <ToolButton icon={TableColumnsSplit} label="Xoá cột" disabled={disabled || !state.canDeleteColumn} onClick={() => chain().deleteColumn().run()} />
          <ToolButton icon={PanelTop} label="Bật / tắt hàng tiêu đề" disabled={disabled} onClick={() => chain().toggleHeaderRow().run()} />
          <ToolButton icon={Rows3} label="Bật / tắt cột tiêu đề" disabled={disabled} onClick={() => chain().toggleHeaderColumn().run()} />
          <ToolButton icon={Trash2} label="Xoá bảng" disabled={disabled} onClick={() => chain().deleteTable().run()} />
        </>
      ) : null}
    </>
  );
};
