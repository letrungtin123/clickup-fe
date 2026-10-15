import { cn } from "cn";
import { Check, Pencil, X } from "lucide-react";
import {
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { taskEditErrorMessage } from "../../task-edit-model";
import { InlineEditContext } from "./inline-edit-context";

/**
 * Click-to-edit fields on the task page (PD-044; PD-047: "click cây bút chì thì đừng popup modal, cho sửa trực tiếp bên
 * trong luôn"). When the viewer may change a field, the whole field is its edit button ("Sửa <label>"): hover or
 * keyboard focus shows a soft rounded background and a small pencil right next to the label (or right after the text);
 * on touch screens the pencil always shows, subtle. A click, Enter or Space turns the field into its editor in place
 * with Lưu / Hủy (Enter saves a one-line input, Ctrl+Enter a multi-line one, Esc cancels), a spinner while saving, the
 * error under the editor and a toast once saved — never a dialog. One field is in edit mode at a time inside an
 * <InlineEditScope>. Fields the viewer may not change look plain (no hover, no pencil).
 */

/** One field in edit mode at a time below this point (a task page; key it by the task so it resets). */
export const InlineEditScope = ({ children }: { children: ReactNode }) => {
  const [active, setActive] = useState<string | null>(null);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <InlineEditContext value={value}>{children}</InlineEditContext>;
};

/** What an editor gets: its draft, the id its control should carry (labelled by the field) and the state. */
export type InlineEditorProps<T> = {
  id: string;
  value: T;
  onChange: (value: T) => void;
  /** The field's label, for controls that take an aria-label instead of an id. */
  label: string;
  invalid: boolean;
  disabled: boolean;
};

type InlineFieldProps<T> = {
  /** Unique within the scope, e.g. "note" or "sub-<id>-qty". */
  editKey: string;
  label: string;
  /** The viewer may change this field now: the field becomes its edit button. */
  canEdit: boolean;
  /** The value as shown when not editing. */
  children: ReactNode;
  /** The draft when the editor opens (read each time it opens). */
  initial: () => T;
  renderEditor: (props: InlineEditorProps<T>) => ReactNode;
  /** Problem with the draft (null = fine), shown under the editor; nothing is sent. */
  validate?: ((draft: T) => string | null) | undefined;
  /** Saving an unchanged draft just closes the editor. */
  isUnchanged?: ((draft: T) => boolean) | undefined;
  /** Sends the draft; a rejection keeps the editor open with the error. */
  onSave: (draft: T) => Promise<unknown>;
  /** Toast once saved. */
  successMessage: string | ((draft: T) => string);
  /** Muted line under the editor (live: may depend on the draft). */
  hint?: ReactNode | ((draft: T) => ReactNode);
  /** A visible caption above the editor (e.g. "Số tấm của task này"); otherwise the label is read to screen readers. */
  editorLabel?: string | undefined;
  /** Multi-line editors: Enter types a new line instead of saving (Ctrl+Enter saves). */
  multiline?: boolean | undefined;
  /**
   * "fact": label above the value (detail grid; the field spans the full row while editing).
   * "inline": the value with the pencil right after it (title, subtask rows).
   */
  variant?: "fact" | "inline" | undefined;
  /**
   * Inline variant only. "field" (default): the text and its pencil are the edit button. "pencil": only the pencil is
   * (the text is itself a link, e.g. a subtask's name that opens it).
   */
  trigger?: "field" | "pencil" | undefined;
  /** The edit button's accessible name; default "Sửa <label>". */
  editLabel?: string | undefined;
  /** The save button's text; default "Lưu" (e.g. "Gửi đề nghị"). */
  saveLabel?: string | undefined;
  className?: string | undefined;
};

/** The field label of the "fact" variant (same look as job-bits Fact). */
const factLabel = "text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase";

/** The trigger is focused with the keyboard (not a link or button raised inside the value). */
const triggerFocused = "has-[[data-inline-trigger]:focus-visible]:bg-surface-hover";

/** Desktop: the pencil shows on hover / keyboard focus of the field; touch: always, subtle. */
const pencilMark =
  "shrink-0 text-foreground-subtle transition-opacity duration-150 pointer-fine:opacity-0 pointer-fine:group-hover/inline:opacity-100 pointer-fine:group-has-[[data-inline-trigger]:focus-visible]/inline:opacity-100";

/** Links and buttons inside a value (e.g. "Sao chép" of a folder path) stay usable above the field's edit button. */
const raiseInteractive =
  "[&_a]:relative [&_a]:z-[1] [&_button]:relative [&_button]:z-[1] [&_.select-all]:relative [&_.select-all]:z-[1]";

/** Inline-editable field (see the module comment). */
export const InlineField = <T,>({
  editKey,
  label,
  canEdit,
  children,
  initial,
  renderEditor,
  validate,
  isUnchanged,
  onSave,
  successMessage,
  hint,
  editorLabel,
  multiline = false,
  variant = "fact",
  trigger = "field",
  editLabel,
  saveLabel,
  className
}: InlineFieldProps<T>) => {
  const scope = use(InlineEditContext);
  const [localActive, setLocalActive] = useState<string | null>(null);
  const active = scope ? scope.active : localActive;
  const setActive = scope ? scope.setActive : setLocalActive;
  const editing = canEdit && active === editKey;
  const valueId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Set by Lưu / Hủy: focus goes back to the field (not when another field took over).
  const returnFocus = useRef(false);
  const actionLabel = editLabel ?? `Sửa ${label}`;

  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    triggerRef.current?.focus();
  }, [editing]);

  const close = () => {
    returnFocus.current = true;
    setActive(null);
  };

  const editor = editing ? (
    <InlineEditor
      label={label}
      groupLabel={actionLabel}
      editorLabel={editorLabel}
      initial={initial}
      renderEditor={renderEditor}
      validate={validate}
      isUnchanged={isUnchanged}
      onSave={onSave}
      successMessage={successMessage}
      hint={hint}
      multiline={multiline}
      saveLabel={saveLabel}
      onClose={close}
    />
  ) : null;

  /** The field's edit button, stretched over the field (the label, pencil and value stay visible through it). */
  const overlay = (rounded: string, describedBy?: string) => (
    <button
      ref={triggerRef}
      type="button"
      data-inline-trigger=""
      aria-label={actionLabel}
      aria-describedby={describedBy}
      onClick={(event) => {
        event.stopPropagation();
        setActive(editKey);
      }}
      className={cn(
        "absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
        rounded
      )}
    />
  );

  if (variant === "inline") {
    if (editor) return <div className={cn("w-full min-w-0 basis-full", className)}>{editor}</div>;
    if (!canEdit) return <div className={cn("min-w-0", className)}>{children}</div>;
    if (trigger === "pencil") {
      return (
        <div className={cn("group/inline flex min-w-0 items-center gap-0.5", className)}>
          <div className="min-w-0">{children}</div>
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={actionLabel}
            title={actionLabel}
            onClick={(event) => {
              event.stopPropagation();
              setActive(editKey);
            }}
            className={cn(
              pencilMark,
              "hover:text-foreground focus-visible:opacity-100 max-sm:size-10 [&_svg]:size-3.5"
            )}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </div>
      );
    }
    return (
      <div className={cn("min-w-0", className)}>
        {/* A translucent tint: it also shows on rows that have their own hover background (subtask rows). */}
        <div className="group/inline relative -mx-1.5 inline-flex max-w-[calc(100%+0.75rem)] min-w-0 items-center gap-1.5 rounded-md px-1.5 align-middle transition-colors hover:bg-foreground/[0.06] has-[[data-inline-trigger]:focus-visible]:bg-foreground/[0.06] max-sm:min-h-10">
          <div className={cn("min-w-0", raiseInteractive)}>{children}</div>
          <Pencil aria-hidden="true" className={cn(pencilMark, "size-3.5")} />
          {overlay("rounded-md")}
        </div>
      </div>
    );
  }

  // "fact". dt / dd stay the only children of the row (valid <dl>); the edit button sits in the dt and is stretched over
  // the whole field. Negative margins give the hover background room without moving the text out of line with the
  // plain facts around it.
  if (editor) {
    return (
      <div
        className={cn(
          "col-span-full -mx-2 -my-1 flex min-w-0 flex-col gap-1 rounded-lg bg-surface px-2 py-2 shadow-xs ring-1 ring-border",
          className
        )}
      >
        <dt className={factLabel}>{label}</dt>
        <dd className="min-w-0 text-[13px]">{editor}</dd>
      </div>
    );
  }
  if (!canEdit) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
        <dt className={factLabel}>{label}</dt>
        <dd className="min-w-0 text-[13px]">{children}</dd>
      </div>
    );
  }
  return (
    <div
      className={cn(
        // Phones: at least 44px tall (label + value + padding), text kept in line with the plain facts beside it.
        "group/inline relative -mx-2 -my-1 flex min-w-0 flex-col gap-0.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface-hover max-sm:min-h-11",
        triggerFocused,
        className
      )}
    >
      <dt className={cn(factLabel, "flex min-w-0 items-center gap-1")}>
        <span className="min-w-0">{label}</span>
        <Pencil aria-hidden="true" className={cn(pencilMark, "size-3")} />
        {overlay("rounded-lg", valueId)}
      </dt>
      <dd id={valueId} className={cn("min-w-0 text-[13px]", raiseInteractive)}>
        {children}
      </dd>
    </div>
  );
};

/** Focusable controls of an editor, first one gets the focus when it opens. */
const focusable =
  "input:not([type=hidden]):not([aria-hidden=true]):not([tabindex='-1']), textarea, button:not([tabindex='-1']), [role=combobox]";

const InlineEditor = <T,>({
  label,
  groupLabel,
  editorLabel,
  initial,
  renderEditor,
  validate,
  isUnchanged,
  onSave,
  successMessage,
  hint,
  multiline,
  saveLabel,
  onClose
}: Pick<
  InlineFieldProps<T>,
  | "label"
  | "editorLabel"
  | "initial"
  | "renderEditor"
  | "validate"
  | "isUnchanged"
  | "onSave"
  | "successMessage"
  | "hint"
  | "multiline"
  | "saveLabel"
> & { groupLabel: string; onClose: () => void }) => {
  const id = useId();
  const [draft, setDraft] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(focusable)?.focus();
  }, []);

  const save = async () => {
    if (saving) return;
    const problem = validate?.(draft) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    if (isUnchanged?.(draft)) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      toast.success(typeof successMessage === "function" ? successMessage(draft) : successMessage);
      onClose();
    } catch (failure) {
      setError(taskEditErrorMessage(failure));
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Popups of the editor (select lists, calendars) are portaled: their keys are their own.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      // Keep the sheet / dialog around the page open.
      event.stopPropagation();
      if (!saving) onClose();
    } else if (
      event.key === "Enter" &&
      !event.nativeEvent.isComposing &&
      ((event.target instanceof HTMLInputElement && !multiline) ||
        (event.target instanceof HTMLTextAreaElement && (event.ctrlKey || event.metaKey)))
    ) {
      event.preventDefault();
      void save();
    }
  };

  const hintNode = typeof hint === "function" ? hint(draft) : hint;
  const errorId = `${id}-error`;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={groupLabel}
      aria-describedby={error ? errorId : undefined}
      aria-busy={saving}
      className="flex w-full min-w-0 flex-col gap-2 pt-0.5"
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      {editorLabel ? (
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {editorLabel}
        </label>
      ) : (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className="min-w-0">
        {renderEditor({
          id,
          value: draft,
          onChange: (next) => {
            setDraft(next);
            if (error) setError(null);
          },
          label,
          invalid: error !== null,
          disabled: saving
        })}
      </div>
      {/* The note (error or hint) on the left, the compact actions on the right; they stack when the row is narrow. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          {error ? (
            <p id={errorId} role="alert" className="text-xs whitespace-pre-line text-danger">
              {error}
            </p>
          ) : hintNode ? (
            <p className="text-xs text-foreground-muted">{hintNode}</p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            <X aria-hidden="true" />
            Hủy
          </Button>
          <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner /> : saveLabel ? null : <Check aria-hidden="true" />}
            {saveLabel ?? "Lưu"}
          </Button>
        </div>
      </div>
    </div>
  );
};
