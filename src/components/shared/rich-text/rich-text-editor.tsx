import Mention, { type MentionNodeAttrs } from "@tiptap/extension-mention";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { PluginKey } from "@tiptap/pm/state";
import {
  EditorContent,
  Extension,
  mergeAttributes,
  ReactRenderer,
  useEditor,
  type AnyExtension,
  type Editor
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { exitSuggestion, type SuggestionOptions } from "@tiptap/suggestion";
import { cn } from "cn";
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
  type Ref
} from "react";
import { toast } from "sonner";

import type { RichTextDoc } from "@/contracts/rich-text";
import type { UserRef } from "@/contracts/work";

import { EditorToolbar } from "./editor-toolbar";
import {
  asRichTextDoc,
  isEmptyDoc,
  isSafeHref,
  prepareDoc,
  type RichTextDocLike,
  type RichTextVariant
} from "./helpers";
import { MentionList, type MentionListHandle, type MentionListProps } from "./mention-list";
import "./rich-text.css";

export type RichTextEditorHandle = {
  /** Focus the document (cursor at the end by default). */
  focus: (position?: "start" | "end") => void;
  /** Empty the document (does not call onChange). */
  clear: () => void;
  /** Current document, already passed through the shared server sanitizer. */
  getDoc: () => RichTextDoc;
  /** True when there is no visible text and no mention. */
  isEmpty: () => boolean;
  /** Replace the document programmatically (does not call onChange). */
  setDoc: (doc: RichTextDocLike | null) => void;
};

export type MentionSource = (query: string, signal?: AbortSignal) => Promise<UserRef[]>;

export type RichTextEditorProps = {
  /**
   * External value. Applied whenever it changes while the editor is NOT focused (so remote updates
   * never clobber what the user is typing). Use it as the initial content too.
   */
  value?: RichTextDocLike | null | undefined;
  /** Every edit (raw editor JSON — sanitize with prepareDoc before sending). */
  onChange?: ((doc: RichTextDoc) => void) | undefined;
  /** Mod+Enter always; Enter too when `submitOnEnter`. Receives the sanitized doc; never empty. */
  onSubmit?: ((doc: RichTextDoc) => void) | undefined;
  placeholder?: string | undefined;
  /** Limits + available blocks: "description" adds headings and rules; "comment"/"message" stay compact. */
  variant: RichTextVariant;
  /** Enter submits, Shift+Enter inserts a line break (lists and code blocks keep normal Enter). */
  submitOnEnter?: boolean | undefined;
  /** Async people search for @mentions (debounced by the editor, aborted when the query changes). */
  mentionSource?: MentionSource | undefined;
  autoFocus?: boolean | undefined;
  disabled?: boolean | undefined;
  /** Show the formatting toolbar above the document. */
  toolbar?: boolean | undefined;
  /** Extra controls at the end of the toolbar row (attach, send…). */
  toolbarTrailing?: ReactNode;
  /** Classes for the toolbar row (e.g. "flex-nowrap overflow-x-auto"). */
  toolbarClassName?: string | undefined;
  className?: string | undefined;
  /** Classes for the editable area (min/max height, padding). */
  contentClassName?: string | undefined;
  /** Files pasted or dropped into the document (images, attachments). */
  onPasteFiles?: ((files: File[]) => void) | undefined;
  onFocus?: (() => void) | undefined;
  /** Blur with the current raw doc (save-on-blur editors). */
  onBlur?: ((doc: RichTextDoc) => void) | undefined;
  "aria-label"?: string | undefined;
  ref?: Ref<RichTextEditorHandle> | undefined;
  /**
   * Extra Tiptap extensions for one surface only (knowledge items: tables, images). Keep the array
   * stable (memoize it): a new array recreates the editor.
   */
  extensions?: readonly AnyExtension[] | undefined;
  /** Extra toolbar controls placed before `toolbarTrailing` (e.g. insert table / image). */
  toolbarExtras?: ((editor: Editor) => ReactNode) | undefined;
  /** The editor instance (to run commands from outside, e.g. insert an uploaded image). */
  onEditorReady?: ((editor: Editor) => void) | undefined;
};

type Callbacks = Pick<
  RichTextEditorProps,
  "onChange" | "onSubmit" | "onPasteFiles" | "onFocus" | "onBlur" | "mentionSource" | "submitOnEnter"
>;

/** Mutable bridge between React props and long-lived editor extensions (latest callbacks, popup state). */
class Bridge {
  callbacks: Callbacks = {};
  mentionOpen = false;
  sync(callbacks: Callbacks) {
    this.callbacks = callbacks;
  }
}

const createBridge = () => new Bridge();

const variantContent: Record<RichTextVariant, string> = {
  description: "min-h-24",
  comment: "min-h-10 max-h-72 overflow-y-auto",
  message: "min-h-6 max-h-60 overflow-y-auto"
};

/** ProseMirror needs at least one block: empty documents become a single empty paragraph. */
const toEditorContent = (input: RichTextDocLike | null | undefined): RichTextDoc => {
  const doc = asRichTextDoc(input);
  return doc?.content && doc.content.length > 0 ? doc : { type: "doc", content: [{ type: "paragraph" }] };
};

const sanitizedOrRaw = (doc: RichTextDoc, variant: RichTextVariant) => {
  const prepared = prepareDoc(doc, variant, { allowEmpty: true });
  return prepared.ok ? prepared.doc : doc;
};

const comparable = (input: RichTextDocLike | null | undefined, variant: RichTextVariant) => {
  const doc = asRichTextDoc(input);
  if (!doc || isEmptyDoc(doc)) return "";
  return JSON.stringify(sanitizedOrRaw(doc, variant));
};

/**
 * Most @mention suggestions shown at once (the people directory's page maximum). The popup scrolls, so a source may
 * return everyone who can be mentioned; a short cap used to hide people (PD-053).
 */
const mentionSuggestionMax = 50;

type FloatingMiddleware = NonNullable<NonNullable<SuggestionOptions["floatingUi"]>["middleware"]>[number];

/** Space kept between the @mention popup and the viewport edges. */
const viewportGutter = 8;

/**
 * Keeps the @mention popup inside the viewport horizontally: a caret near the right edge of a phone used to push it
 * off-screen and scroll the page sideways. Runs after Tiptap's offset / flip; page coordinates for "absolute".
 */
const keepInViewport: FloatingMiddleware = {
  name: "keepInViewport",
  fn: ({ x, rects, strategy }) => {
    const scrollX = strategy === "fixed" ? 0 : window.scrollX;
    const right = scrollX + document.documentElement.clientWidth - rects.floating.width - viewportGutter;
    return { x: Math.max(scrollX + viewportGutter, Math.min(x, right)) };
  }
};

const buildExtensions = (
  variant: RichTextVariant,
  placeholder: string | undefined,
  bridge: Bridge,
  mentionKey: PluginKey
) => {
  const rich = variant === "description";

  const submit = (editor: Editor) => {
    const onSubmit = bridge.callbacks.onSubmit;
    if (!onSubmit) return false;
    // Disabled while a previous submit is in flight: swallow the shortcut (callers also guard).
    if (!editor.isEditable) return true;
    const prepared = prepareDoc(editor.getJSON() as RichTextDoc, variant);
    if (!prepared.ok) {
      if (prepared.reason === "too-large") toast.error(prepared.message);
      return true;
    }
    onSubmit(prepared.doc);
    return true;
  };

  const Shortcuts = Extension.create({
    name: "nessoShortcuts",
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        "Mod-Enter": ({ editor }) => submit(editor),
        Enter: ({ editor }) => {
          if (!bridge.callbacks.submitOnEnter || bridge.mentionOpen) return false;
          if (editor.isActive("codeBlock") || editor.isActive("listItem") || editor.isActive("taskItem")) {
            return false;
          }
          return submit(editor);
        },
        Escape: ({ editor }) => {
          if (bridge.mentionOpen) return false;
          // First Escape leaves the document (keeps drafts safe); a second one reaches the page.
          editor.commands.blur();
          return true;
        }
      };
    }
  });

  const suggestion: Omit<SuggestionOptions<UserRef, MentionNodeAttrs>, "editor"> = {
    char: "@",
    pluginKey: mentionKey,
    allowSpaces: false,
    debounce: 180,
    floatingUi: { middleware: [keepInViewport] },
    allow: () => Boolean(bridge.callbacks.mentionSource),
    items: async ({ query, signal }) => {
      const source = bridge.callbacks.mentionSource;
      if (!source) return [];
      try {
        return (await source(query, signal)).slice(0, mentionSuggestionMax);
      } catch {
        return [];
      }
    },
    render: () => {
      let component: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
      let unmount: (() => void) | null = null;
      return {
        onStart: (props) => {
          bridge.mentionOpen = true;
          component = new ReactRenderer(MentionList, {
            props: { items: props.items, loading: props.loading, query: props.query, command: props.command },
            editor: props.editor
          });
          component.element.style.zIndex = "80";
          unmount = props.mount(component.element);
        },
        onUpdate: (props) => {
          component?.updateProps({
            items: props.items,
            loading: props.loading,
            query: props.query,
            command: props.command
          });
        },
        onKeyDown: ({ event, view }) => {
          if (event.key === "Escape") {
            exitSuggestion(view, mentionKey);
            return true;
          }
          return component?.ref?.onKeyDown(event) ?? false;
        },
        onExit: () => {
          bridge.mentionOpen = false;
          unmount?.();
          unmount = null;
          component?.destroy();
          component = null;
        }
      };
    }
  };

  return [
    StarterKit.configure({
      heading: rich ? { levels: [1, 2, 3] } : false,
      horizontalRule: rich ? {} : false,
      trailingNode: false,
      dropcursor: { color: "var(--brand)", width: 2 },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank", class: null }
      }
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: placeholder ?? "" }),
    Mention.configure({
      deleteTriggerWithBackspace: true,
      renderText: ({ node }) => `@${String(node.attrs.label ?? "")}`,
      renderHTML: ({ node }) => [
        "span",
        mergeAttributes({ class: "rt-mention", "data-type": "mention", "data-id": node.attrs.id as string }),
        `@${String(node.attrs.label ?? node.attrs.id ?? "")}`
      ],
      suggestion
    }),
    Shortcuts
  ];
};

/**
 * Tiptap v3 editor that only produces nodes/marks the server keeps (contracts/rich-text.ts):
 * paragraphs, headings 1–3 (description), lists, task lists, quotes, code, rules, hard breaks,
 * links (http/https/mailto) and @mentions {id,label}.
 *
 *   <RichTextEditor variant="message" submitOnEnter mentionSource={search} onSubmit={send} ref={handle} />
 */
export const RichTextEditor = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  variant,
  submitOnEnter = false,
  mentionSource,
  autoFocus = false,
  disabled = false,
  toolbar = false,
  toolbarTrailing,
  toolbarClassName,
  className,
  contentClassName,
  onPasteFiles,
  onFocus,
  onBlur,
  "aria-label": ariaLabel,
  ref,
  extensions: extraExtensions,
  toolbarExtras,
  onEditorReady
}: RichTextEditorProps) => {
  const [bridge] = useState(createBridge);
  useLayoutEffect(() => {
    bridge.sync({ onChange, onSubmit, onPasteFiles, onFocus, onBlur, mentionSource, submitOnEnter });
  });
  const hasMentions = Boolean(mentionSource);

  const extensions = useMemo(
    () => [
      ...buildExtensions(variant, placeholder, bridge, new PluginKey(`mention-${variant}`)),
      ...(extraExtensions ?? [])
    ],
    [variant, placeholder, bridge, extraExtensions]
  );

  const editor = useEditor(
    {
      extensions,
      content: toEditorContent(value),
      editable: !disabled,
      autofocus: autoFocus ? "end" : false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: cn("outline-none", variantContent[variant], contentClassName),
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel ?? placeholder ?? "Soạn nội dung"
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          const handler = bridge.callbacks.onPasteFiles;
          if (files.length > 0 && handler) {
            handler(files);
            return true;
          }
          return false;
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (moved) return false;
          const files = Array.from(event.dataTransfer?.files ?? []);
          const handler = bridge.callbacks.onPasteFiles;
          if (files.length > 0 && handler) {
            event.preventDefault();
            handler(files);
            return true;
          }
          return false;
        }
      },
      onUpdate: ({ editor: current }) => bridge.callbacks.onChange?.(current.getJSON() as RichTextDoc),
      onFocus: () => bridge.callbacks.onFocus?.(),
      onBlur: ({ editor: current }) => bridge.callbacks.onBlur?.(current.getJSON() as RichTextDoc)
    },
    [extensions]
  );

  // External value → editor, never while the user is typing.
  useEffect(() => {
    if (editor.isDestroyed || editor.isFocused) return;
    if (comparable(editor.getJSON() as RichTextDoc, variant) === comparable(value, variant)) return;
    editor.commands.setContent(toEditorContent(value), { emitUpdate: false });
  }, [editor, value, variant]);

  const announceEditor = useEffectEvent((instance: Editor) => onEditorReady?.(instance));
  useEffect(() => {
    if (!editor.isDestroyed) announceEditor(editor);
  }, [editor]);

  useEffect(() => {
    if (!editor.isDestroyed && editor.isEditable === disabled) {
      editor.setEditable(!disabled, false);
    }
  }, [editor, disabled]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (position = "end") => {
        editor.commands.focus(position);
      },
      clear: () => {
        editor.commands.setContent(toEditorContent(null), { emitUpdate: false });
      },
      getDoc: () => sanitizedOrRaw(editor.getJSON() as RichTextDoc, variant),
      isEmpty: () => isEmptyDoc(editor.getJSON() as RichTextDoc),
      setDoc: (doc) => {
        editor.commands.setContent(toEditorContent(doc), { emitUpdate: false });
      }
    }),
    [editor, variant]
  );

  return (
    <div
      className={cn("rt-editor flex min-w-0 flex-col", className)}
      data-variant={variant}
      data-disabled={disabled || undefined}
    >
      {toolbar ? (
        <EditorToolbar
          editor={editor}
          variant={variant}
          mentions={hasMentions}
          disabled={disabled}
          extras={toolbarExtras ? toolbarExtras(editor) : null}
          trailing={toolbarTrailing}
          className={cn("pb-1.5", toolbarClassName)}
        />
      ) : null}
      <EditorContent editor={editor} className="rt-content min-w-0 cursor-text" />
    </div>
  );
};
