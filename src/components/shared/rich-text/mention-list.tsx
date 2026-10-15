import { cn } from "cn";
import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Spinner } from "@/components/ui/spinner";
import type { UserRef } from "@/contracts/work";

export type MentionListHandle = { onKeyDown: (event: KeyboardEvent) => boolean };

export type MentionListProps = {
  items: UserRef[];
  loading: boolean;
  query: string;
  command: (item: { id: string; label: string }) => void;
  ref?: Ref<MentionListHandle>;
};

/** The list's inner padding (p-1): kept visible above / below the highlighted row. */
const listPadding = 4;

/**
 * Suggestion popup for @mentions: keyboard navigable (↑/↓/Enter/Tab), avatars, async loading and
 * empty states. Rendered by Tiptap's suggestion plugin through ReactRenderer.
 *
 * Long lists (every channel member, PD-053) scroll inside a fixed max height; the highlighted row is
 * kept in view by scrolling the list only (scrollIntoView would also move the page or the
 * conversation behind the popup). Touch scrolling stays inside the list (overscroll-contain).
 */
export const MentionList = ({ items, loading, query, command, ref }: MentionListProps) => {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Last mouse position: rows scrolling under a still pointer must not steal the keyboard highlight.
  const pointer = useRef("");
  // Reset the highlighted row when the result set changes (render-phase sync, no effect needed).
  const [lastItems, setLastItems] = useState(items);
  if (lastItems !== items) {
    setLastItems(items);
    setActive(0);
  }

  const select = (index: number) => {
    const item = items[index];
    if (item) {
      command({ id: item.id, label: item.displayName });
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowDown") {
        setActive((current) => (items.length === 0 ? 0 : (current + 1) % items.length));
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((current) => (items.length === 0 ? 0 : (current - 1 + items.length) % items.length));
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (items.length === 0) {
          return event.key === "Enter";
        }
        select(active);
        return true;
      }
      return false;
    }
  }));

  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !row) return;
    const top = row.offsetTop - listPadding;
    const bottom = row.offsetTop + row.offsetHeight + listPadding;
    if (top < list.scrollTop) {
      list.scrollTop = Math.max(0, top);
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [active, items]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Gợi ý nhắc tên"
      className="relative max-h-64 w-64 max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95 duration-100"
    >
      {items.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-2 text-[13px] text-foreground-muted">
          {loading ? (
            <>
              <Spinner className="size-3.5" />
              Đang tìm…
            </>
          ) : query ? (
            "Không tìm thấy người phù hợp"
          ) : (
            "Nhập tên để tìm người"
          )}
        </div>
      ) : (
        items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            data-index={index}
            aria-selected={index === active}
            onMouseDown={(event) => event.preventDefault()}
            onPointerMove={(event) => {
              if (event.pointerType !== "mouse") return;
              const at = `${event.screenX},${event.screenY}`;
              if (at === pointer.current) return;
              pointer.current = at;
              if (index !== active) setActive(index);
            }}
            onClick={() => select(index)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none pointer-coarse:py-2",
              index === active ? "bg-accent text-accent-foreground" : "text-foreground"
            )}
          >
            <UserAvatar user={item} size="xs" />
            <span className="min-w-0 flex-1 truncate">{item.displayName}</span>
            {item.email ? (
              <span className="max-w-[45%] truncate text-xs text-foreground-subtle">
                {item.email}
              </span>
            ) : null}
          </button>
        ))
      )}
      {loading && items.length > 0 ? (
        <div className="flex justify-center py-1" aria-hidden="true">
          <Spinner className="size-3 opacity-60" />
        </div>
      ) : null}
    </div>
  );
};
