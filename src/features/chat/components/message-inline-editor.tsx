import { Check } from "lucide-react";
import { useRef } from "react";

import { docToPlainText } from "@/components/shared/rich-text/helpers";
import {
  RichTextEditor,
  type RichTextEditorHandle
} from "@/components/shared/rich-text/rich-text-editor";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/contracts/chat";
import type { RichTextDoc } from "@/contracts/rich-text";
import { useInFlightGuard } from "@/hooks/use-in-flight-guard";

import { useMessageActions } from "./message-context";

/**
 * Inline edit: Enter saves, Shift+Enter breaks the line, Esc cancels. Lazy-loaded by MessageItem so
 * the message list never pulls the editor (Tiptap) in just to render (PERF-16).
 */
const MessageInlineEditor = ({ message }: { message: ChatMessage }) => {
  const actions = useMessageActions();
  const handle = useRef<RichTextEditorHandle | null>(null);
  // The editor closes on save; a second Enter in the same tick must not send a second edit (BUG-WK-15).
  const guard = useInFlightGuard();
  const submit = (doc: RichTextDoc) => {
    if (!guard.tryEnter()) return;
    actions.saveEdit(message, doc, docToPlainText(doc));
  };
  const save = () => {
    if (guard.active) return;
    const doc = handle.current?.getDoc();
    if (!doc || handle.current?.isEmpty()) {
      if (message.attachments.length === 0) {
        actions.requestDelete(message);
        return;
      }
    }
    if (doc) submit(doc);
  };
  return (
    <div
      className="mt-1 rounded-lg border bg-background px-3 py-2 shadow-xs focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-ring/30"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          actions.cancelEdit();
        }
      }}
    >
      <RichTextEditor
        ref={handle}
        variant="message"
        value={message.body}
        submitOnEnter
        autoFocus
        mentionSource={actions.mentionSource}
        allowMentionAll={actions.allowMentionAll}
        onSubmit={submit}
        aria-label="Sửa tin nhắn"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto hidden text-[11px] text-foreground-subtle sm:inline">
          Esc để hủy · Enter để lưu
        </span>
        <Button size="sm" variant="ghost" onClick={actions.cancelEdit}>
          Hủy
        </Button>
        <Button size="sm" onClick={save}>
          <Check />
          Lưu
        </Button>
      </div>
    </div>
  );
};

export default MessageInlineEditor;
