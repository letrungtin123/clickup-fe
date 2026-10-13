import { cn } from "cn";
import { Check, Copy, ExternalLink, FolderOpen, Link2 } from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { copyText, dialogAround } from "../../clipboard";
import { isWebLink } from "../../jobs-model";

/**
 * "Link chia việc" of a line (PD-040): the link or folder of the images given to the person. A web link (http / https)
 * is a plain external link opened in a new tab; anything else — typically a network-drive folder path — is text with
 * "Sao chép". Long values are truncated, the full value is the tooltip. Clicks and Enter stay here: these sit inside
 * clickable task rows / cards.
 */

const keepInside = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();

/** Copies the path; "Đã chép" for a moment. Falls back to the hidden textarea on plain http. */
const useCopy = (value: string) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    const ok = await copyText(value, dialogAround(event.currentTarget));
    if (ok) {
      setCopied(true);
      toast.success("Đã sao chép link chia việc");
    } else {
      toast.error("Không sao chép tự động được — hãy chọn đường dẫn và sao chép thủ công.");
    }
  };
  return { copied, copy };
};

/** Full value with its action: the task sheet row, the phone task card. */
export const WorkLinkValue = ({
  value,
  className
}: {
  value: string | null;
  className?: string;
}) => {
  const text = value?.trim() ?? "";
  const { copied, copy } = useCopy(text);
  if (!text) return <span className={cn("text-foreground-subtle", className)}>—</span>;
  if (isWebLink(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noopener noreferrer"
        title={text}
        onClick={keepInside}
        onKeyDown={keepInside}
        className={cn(
          "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10",
          className
        )}
      >
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{text}</span>
      </a>
    );
  }
  return (
    <span className={cn("flex max-w-full min-w-0 items-center gap-2", className)}>
      <FolderOpen className="size-3.5 shrink-0 text-foreground-muted" aria-hidden="true" />
      {/* A tap selects the whole path (manual copy when the clipboard is refused). */}
      <span className="min-w-0 flex-1 truncate select-all" title={text}>
        {text}
      </span>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={(event) => void copy(event)}
        onKeyDown={keepInside}
        aria-label={`Sao chép link chia việc: ${text}`}
        className="shrink-0 max-sm:min-h-10 max-sm:px-3"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Đã chép" : "Sao chép"}
      </Button>
    </span>
  );
};

/** A small icon for the job's task table: opens a web link, copies a folder path; the value is the tooltip. */
export const WorkLinkIcon = ({ value }: { value: string | null }) => {
  const text = value?.trim() ?? "";
  const { copied, copy } = useCopy(text);
  if (!text) return null;
  const iconClass =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4";
  if (isWebLink(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noopener noreferrer"
        title={text}
        aria-label={`Mở link chia việc: ${text}`}
        onClick={keepInside}
        onKeyDown={keepInside}
        className={cn(iconClass, "text-brand-text")}
      >
        <Link2 aria-hidden="true" />
      </a>
    );
  }
  return (
    <button
      type="button"
      title={`${text}\nBấm để sao chép`}
      aria-label={`Sao chép link chia việc: ${text}`}
      onClick={(event) => void copy(event)}
      onKeyDown={keepInside}
      className={cn(iconClass, "text-foreground-muted")}
    >
      {copied ? (
        <Check aria-hidden="true" className="text-success" />
      ) : (
        <FolderOpen aria-hidden="true" />
      )}
    </button>
  );
};
