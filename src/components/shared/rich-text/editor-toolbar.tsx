import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { cn } from "cn";
import {
  AtSign,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  Underline,
  type LucideIcon
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { modKeyLabel } from "@/lib/keyboard";

import { normalizeHref, type RichTextVariant } from "./helpers";

type ToolbarProps = {
  editor: Editor;
  variant: RichTextVariant;
  mentions: boolean;
  disabled?: boolean | undefined;
  className?: string | undefined;
  /** Extra controls rendered at the end (e.g. attach / send buttons). */
  trailing?: ReactNode;
};

const ToolButton = ({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean | undefined;
  onClick: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-foreground-muted transition-colors duration-100 outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5",
            active && "bg-brand-soft text-brand-text hover:bg-brand-soft hover:text-brand-text"
          )}
        />
      }
    >
      <Icon aria-hidden="true" />
    </TooltipTrigger>
    <TooltipContent>
      {label}
      {shortcut ? <span className="opacity-70">{shortcut}</span> : null}
    </TooltipContent>
  </Tooltip>
);

const Divider = () => <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-border" />;

/** Formatting bar for RichTextEditor. Buttons never steal focus from the document. */
export const EditorToolbar = ({ editor, variant, mentions, disabled, className, trailing }: ToolbarProps) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      link: current.isActive("link"),
      h1: current.isActive("heading", { level: 1 }),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      taskList: current.isActive("taskList"),
      blockquote: current.isActive("blockquote"),
      codeBlock: current.isActive("codeBlock")
    })
  });
  const mod = modKeyLabel();
  const chain = () => editor.chain().focus();
  const rich = variant === "description";

  return (
    <div
      role="toolbar"
      aria-label="Định dạng văn bản"
      className={cn("flex flex-wrap items-center gap-0.5", className)}
    >
      <ToolButton icon={Bold} label="In đậm" shortcut={`${mod}+B`} active={state.bold} disabled={disabled} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="In nghiêng" shortcut={`${mod}+I`} active={state.italic} disabled={disabled} onClick={() => chain().toggleItalic().run()} />
      <ToolButton icon={Underline} label="Gạch chân" shortcut={`${mod}+U`} active={state.underline} disabled={disabled} onClick={() => chain().toggleUnderline().run()} />
      <ToolButton icon={Strikethrough} label="Gạch ngang" active={state.strike} disabled={disabled} onClick={() => chain().toggleStrike().run()} />
      <ToolButton icon={Code} label="Mã" shortcut={`${mod}+E`} active={state.code} disabled={disabled} onClick={() => chain().toggleCode().run()} />
      <LinkButton editor={editor} active={state.link} disabled={disabled} />
      <Divider />
      {rich ? (
        <>
          <ToolButton icon={Heading1} label="Tiêu đề 1" active={state.h1} disabled={disabled} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
          <ToolButton icon={Heading2} label="Tiêu đề 2" active={state.h2} disabled={disabled} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
          <ToolButton icon={Heading3} label="Tiêu đề 3" active={state.h3} disabled={disabled} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
          <Divider />
        </>
      ) : null}
      <ToolButton icon={List} label="Danh sách dấu chấm" active={state.bulletList} disabled={disabled} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="Danh sách đánh số" active={state.orderedList} disabled={disabled} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon={ListChecks} label="Danh sách việc cần làm" active={state.taskList} disabled={disabled} onClick={() => chain().toggleTaskList().run()} />
      <Divider />
      <ToolButton icon={Quote} label="Trích dẫn" active={state.blockquote} disabled={disabled} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton icon={SquareCode} label="Khối mã" active={state.codeBlock} disabled={disabled} onClick={() => chain().toggleCodeBlock().run()} />
      {rich ? (
        <ToolButton icon={Minus} label="Đường kẻ ngang" disabled={disabled} onClick={() => chain().setHorizontalRule().run()} />
      ) : null}
      {mentions ? (
        <ToolButton
          icon={AtSign}
          label="Nhắc tên"
          disabled={disabled}
          onClick={() => {
            const { from } = editor.state.selection;
            const before = from > 1 ? editor.state.doc.textBetween(from - 1, from, " ", " ") : " ";
            chain().insertContent(before.trim() ? " @" : "@").run();
          }}
        />
      ) : null}
      {trailing ? <div className="ml-auto flex items-center gap-1">{trailing}</div> : null}
    </div>
  );
};

const LinkButton = ({ editor, active, disabled }: { editor: Editor; active: boolean; disabled?: boolean | undefined }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const onOpenChange = (next: boolean) => {
    if (next) {
      const current: unknown = editor.getAttributes("link").href;
      setValue(typeof current === "string" ? current : "");
      setInvalid(false);
    }
    setOpen(next);
  };

  const apply = () => {
    if (!value.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setOpen(false);
      return;
    }
    const href = normalizeHref(value);
    if (!href) {
      setInvalid(true);
      return;
    }
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .insertContent(" ")
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              aria-label="Liên kết"
              aria-pressed={active}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md text-foreground-muted transition-colors duration-100 outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5",
                active && "bg-brand-soft text-brand-text hover:bg-brand-soft hover:text-brand-text"
              )}
            />
          }
        >
          <Link2 aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Liên kết</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 gap-2" align="start">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="text-xs font-medium text-foreground-muted" htmlFor="rt-link-input">
            Địa chỉ liên kết
          </label>
          <Input
            id="rt-link-input"
            autoFocus
            value={value}
            placeholder="https://…"
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }}
          />
          {invalid ? (
            <p className="text-xs text-danger">Chỉ hỗ trợ liên kết http(s) hoặc mailto.</p>
          ) : null}
          <div className="flex justify-end gap-2">
            {active ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                Gỡ liên kết
              </Button>
            ) : null}
            <Button type="submit" size="sm">
              Lưu
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};
