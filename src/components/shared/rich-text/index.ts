/**
 * Shared rich text (tasks: descriptions + comments; chat: messages).
 *
 * Documents are allow-listed Tiptap JSON (`RichTextDoc`, contracts/rich-text.ts) — never HTML.
 *
 *   RichTextEditor   Tiptap v3 editor. Props: value, onChange, onSubmit, placeholder,
 *                    variant ("comment" | "description" | "message"), submitOnEnter, mentionSource,
 *                    autoFocus, disabled, toolbar, toolbarTrailing, toolbarClassName, className, contentClassName,
 *                    onPasteFiles, onFocus, onBlur, aria-label, ref → RichTextEditorHandle
 *                    { focus(pos?), clear(), getDoc(), isEmpty(), setDoc(doc) }.
 *   RichTextView     Read-only React renderer (no innerHTML). Props: doc, compact, empty, selfId,
 *                    onMentionClick, className.
 *   helpers          isEmptyDoc, docToPlainText, plainTextToDoc, prepareDoc (runs the server
 *                    sanitizer locally), docMentions, docsEqual, normalizeHref, emptyDoc.
 *
 * The editor pulls in Tiptap (~100 kB gz); import it from route-level / lazily loaded code.
 */
export { RichTextEditor } from "./rich-text-editor";
export type { MentionSource, RichTextEditorHandle, RichTextEditorProps } from "./rich-text-editor";
export { RichTextView } from "./rich-text-view";
export {
  asRichTextDoc,
  docMentions,
  docsEqual,
  docToPlainText,
  emptyDoc,
  isEmptyDoc,
  isSafeHref,
  normalizeHref,
  plainTextToDoc,
  prepareDoc,
  richTextLimits
} from "./helpers";
export type { PreparedDoc, RichTextDocLike, RichTextVariant } from "./helpers";
export type { RichTextDoc, RichTextNode } from "@/contracts/rich-text";
