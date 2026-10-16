import { cn } from "cn";
import { Fragment, memo, type ReactNode } from "react";

import { MENTION_ALL_ID, type RichTextNode } from "@/contracts/rich-text";

import { asRichTextDoc, headingAnchorId, isSafeHref, type RichTextDocLike } from "./helpers";
import "./rich-text.css";

type RichTextViewProps = {
  doc: RichTextDocLike | null | undefined;
  className?: string | undefined;
  /** Smaller type for dense contexts (comments in narrow panels, previews). */
  compact?: boolean | undefined;
  /** Rendered when the document has no content. */
  empty?: ReactNode;
  /** Mentions of this user id are highlighted ("you were mentioned"). */
  selfId?: string | null | undefined;
  /**
   * The @all mention (PD-061) reaches the viewer — everyone but the author: highlighted like a mention of them.
   * @all is never a button, whatever `onMentionClick`.
   */
  mentionAllSelf?: boolean | undefined;
  /** Makes mention chips buttons (e.g. open a profile / DM). */
  onMentionClick?: ((userId: string) => void) | undefined;
  /**
   * Gives headings stable ids (`<prefix>-<path>`, see headingAnchorId) so a table of contents can
   * link to them (knowledge items).
   */
  headingIdPrefix?: string | undefined;
  /**
   * Renders node types this shared view does not know (knowledge tables and images). Return undefined to
   * fall back to the default rendering. `children()` renders the node's content with the same options.
   */
  renderCustom?: CustomNodeRenderer | undefined;
};

export type CustomNodeRenderer = (node: RichTextNode, key: string, children: () => ReactNode) => ReactNode | undefined;

type RenderContext = Pick<
  RichTextViewProps,
  "selfId" | "mentionAllSelf" | "onMentionClick" | "headingIdPrefix" | "renderCustom"
>;

const headingTags = { 1: "h1", 2: "h2", 3: "h3" } as const;

const renderMarks = (node: RichTextNode, key: string): ReactNode => {
  let element: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        element = <strong>{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "strike":
        element = <s>{element}</s>;
        break;
      case "underline":
        element = <u>{element}</u>;
        break;
      case "code":
        element = <code>{element}</code>;
        break;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        if (isSafeHref(href)) {
          element = (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {element}
            </a>
          );
        }
        break;
      }
      default:
        break;
    }
  }
  return <Fragment key={key}>{element}</Fragment>;
};

const renderNodes = (nodes: RichTextNode[] | undefined, context: RenderContext, path: string) =>
  nodes?.map((node, index) => renderNode(node, context, `${path}.${index}`)) ?? null;

const renderNode = (node: RichTextNode, context: RenderContext, key: string): ReactNode => {
  const children = () => renderNodes(node.content, context, key);
  if (context.renderCustom) {
    const custom = context.renderCustom(node, key, children);
    if (custom !== undefined) return custom;
  }
  switch (node.type) {
    case "text":
      return renderMarks(node, key);
    case "hardBreak":
      return <br key={key} />;
    case "mention": {
      const id = typeof node.attrs?.id === "string" ? node.attrs.id : "";
      const label = typeof node.attrs?.label === "string" ? node.attrs.label : "";
      if (id === MENTION_ALL_ID) {
        // @all: everyone in the conversation, not a profile (amber + bold, rich-text.css).
        return (
          <span
            key={key}
            className="rt-mention"
            data-id={id}
            data-all="true"
            data-self={context.mentionAllSelf || undefined}
            title="Nhắc tất cả thành viên"
          >
            @{label || MENTION_ALL_ID}
          </span>
        );
      }
      const self = Boolean(context.selfId && id === context.selfId);
      if (context.onMentionClick && id) {
        const onClick = context.onMentionClick;
        return (
          <button
            key={key}
            type="button"
            className="rt-mention"
            data-self={self || undefined}
            onClick={() => onClick(id)}
          >
            @{label}
          </button>
        );
      }
      return (
        <span key={key} className="rt-mention" data-id={id} data-self={self || undefined}>
          @{label}
        </span>
      );
    }
    case "paragraph":
      return <p key={key}>{children()}</p>;
    case "heading": {
      const level = node.attrs?.level === 1 || node.attrs?.level === 3 ? node.attrs.level : 2;
      const Tag = headingTags[level];
      const id = context.headingIdPrefix ? headingAnchorId(context.headingIdPrefix, key) : undefined;
      return (
        <Tag key={key} id={id}>
          {children()}
        </Tag>
      );
    }
    case "bulletList":
      return <ul key={key}>{children()}</ul>;
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
      return (
        <ol key={key} start={start === 1 ? undefined : start}>
          {children()}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{children()}</li>;
    case "taskList":
      return (
        <ul key={key} data-type="taskList">
          {children()}
        </ul>
      );
    case "taskItem": {
      const checked = node.attrs?.checked === true;
      return (
        <li key={key} data-checked={checked}>
          <label>
            <input type="checkbox" checked={checked} disabled readOnly aria-label={checked ? "Đã xong" : "Chưa xong"} />
          </label>
          <div>{children()}</div>
        </li>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{children()}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{node.content?.map((child) => child.text ?? "").join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    default:
      // Unknown node types are never rendered as markup; keep their text so nothing is silently lost.
      return node.content ? <Fragment key={key}>{children()}</Fragment> : null;
  }
};

/**
 * Read-only renderer for allow-listed rich text JSON. Builds React elements directly (never
 * innerHTML), so documents cannot inject markup; links are restricted to http(s)/mailto and open in
 * a new tab with `noopener noreferrer nofollow`. Memoized by document identity for long lists.
 */
export const RichTextView = memo(function RichTextView({
  doc: input,
  className,
  compact = false,
  empty = null,
  selfId,
  mentionAllSelf,
  onMentionClick,
  headingIdPrefix,
  renderCustom
}: RichTextViewProps) {
  const doc = asRichTextDoc(input);
  if (!doc?.content || doc.content.length === 0) {
    return <>{empty}</>;
  }
  return (
    <div className={cn("rt-content", compact && "rt-compact", className)}>
      {renderNodes(doc.content, { selfId, mentionAllSelf, onMentionClick, headingIdPrefix, renderCustom }, "n")}
    </div>
  );
});
