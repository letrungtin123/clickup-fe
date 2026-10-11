import { cn } from "cn";
import { ListTree } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { scrollWithin } from "../editor/scroll";
import { activeTocId, tocDepths, type TocEntry } from "../model/toc";

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Scrolls the item (only its own scroll area, so the sticky item bar stays) to the heading and flashes it;
 * focus moves there for keyboard users.
 */
const scrollToHeading = (id: string) => {
  const target = document.getElementById(id);
  if (!target) return;
  scrollWithin(target, "start", { offset: 24, smooth: !reducedMotion() });
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.dataset.flash = "true";
  window.setTimeout(() => {
    delete target.dataset.flash;
  }, 1700);
};

/** Scroll-spy: the heading the reader is currently in. */
const useActiveHeading = (entries: readonly TocEntry[], scrollRoot: RefObject<HTMLElement | null>) => {
  const [active, setActive] = useState<string | null>(entries[0]?.id ?? null);
  useEffect(() => {
    const root = scrollRoot.current;
    if (!root || entries.length === 0) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rootTop = root.getBoundingClientRect().top;
      const offsets = new Map<string, number>();
      for (const entry of entries) {
        const element = document.getElementById(entry.id);
        if (element) offsets.set(entry.id, element.getBoundingClientRect().top - rootTop + root.scrollTop);
      }
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
      setActive(atBottom ? (entries.at(-1)?.id ?? null) : activeTocId(entries, offsets, root.scrollTop));
    };
    const onScroll = () => {
      frame ||= window.requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [entries, scrollRoot]);
  return active;
};

const TocList = ({
  entries,
  active,
  onPick,
  large = false
}: {
  entries: readonly TocEntry[];
  active: string | null;
  onPick: (id: string) => void;
  large?: boolean;
}) => {
  const depths = tocDepths(entries);
  return (
    <ol className="flex flex-col gap-px">
      {entries.map((entry, index) => {
        const current = entry.id === active;
        return (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              aria-current={current ? "location" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onPick(entry.id);
              }}
              style={{ paddingLeft: `${0.75 + (depths[index] ?? 0) * 0.85}rem` }}
              className={cn(
                "relative block rounded-md py-1.5 pr-2 leading-snug text-foreground-muted outline-none transition-colors",
                "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent",
                "hover:bg-surface-hover/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                large ? "text-[15px] pointer-coarse:py-2.5" : "text-[13px]",
                (depths[index] ?? 0) > 0 && !large && "text-[12.5px]",
                current && "font-medium text-foreground before:bg-brand"
              )}
            >
              <span className="line-clamp-2">{entry.text}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
};

/** Desktop: sticky "Mục lục" next to the article, following the reading position. */
export const TocNav = ({ entries, scrollRoot }: { entries: readonly TocEntry[]; scrollRoot: RefObject<HTMLElement | null> }) => {
  const active = useActiveHeading(entries, scrollRoot);
  if (entries.length < 2) return null;
  return (
    <nav aria-label="Mục lục" className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 px-3 text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase">
        <ListTree className="size-3.5" aria-hidden="true" />
        Mục lục
      </p>
      <TocList entries={entries} active={active} onPick={scrollToHeading} />
    </nav>
  );
};

/** Phones / narrow screens: the TOC folds into a floating button that opens a sheet (PD-031 §09). */
export const TocSheetButton = ({ entries, scrollRoot }: { entries: readonly TocEntry[]; scrollRoot: RefObject<HTMLElement | null> }) => {
  const [open, setOpen] = useState(false);
  const active = useActiveHeading(entries, scrollRoot);
  if (entries.length < 2) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed right-4 bottom-[calc(var(--safe-bottom,0px)+1rem+var(--keyboard-inset,0px))] z-30 inline-flex h-11 items-center gap-2 rounded-full border bg-surface-raised/95 px-4 text-[13px] font-medium shadow-lg backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ListTree className="size-4 text-brand-text" aria-hidden="true" />
        Mục lục
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[75dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-(--safe-bottom)">
          <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
          <SheetHeader className="px-4 pt-2 pb-2">
            <SheetTitle>Mục lục</SheetTitle>
            <SheetDescription className="sr-only">Chuyển tới một phần của mục</SheetDescription>
          </SheetHeader>
          <div className="px-2 pb-4">
            <TocList
              entries={entries}
              active={active}
              large
              onPick={(id) => {
                setOpen(false);
                // Let the sheet close (and give the scroll back) before moving.
                window.setTimeout(() => scrollToHeading(id), 220);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
