import { cn } from "cn";
import { Archive, BookPlus, Ellipsis, History, Library, Lock, Settings2, Trash2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { Link, useMatch, useNavigate } from "react-router";

import { ProjectIcon } from "@/components/shared/project-icon";
import { ActionsContextMenu, ActionsDropdown, type RowAction } from "@/components/shared/row-actions";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { KnowledgeSpace } from "@/contracts/knowledge";
import { useUiStore } from "@/stores/ui-store";

import { useKnowledgePermissions, useKnowledgeSpaces } from "../hooks";
import { canCreateSpace } from "../model/access";

/**
 * Sidebar › "Tri thức" (PD-031 §09): spaces in two groups, Công khai and Riêng tư (lock icon), like the
 * project tree. Rendered only for people holding `knowledge.view` (the caller checks).
 */
export const KnowledgeSidebarSection = ({ onNavigate }: { onNavigate?: (() => void) | undefined }) => {
  const spaces = useKnowledgeSpaces();
  const permissions = useKnowledgePermissions();
  const setNewSpaceOpen = useUiStore((state) => state.setNewSpaceOpen);
  const match = useMatch("/k/:spaceId/*");
  const activeId = match?.params.spaceId;
  const homeMatch = useMatch({ path: "/k", end: true });

  if (spaces.isPending) {
    return (
      <div className="flex flex-col gap-1 px-2 py-1" aria-busy="true" aria-label="Đang tải kho tri thức">
        {[64, 48].map((width) => (
          <div key={width} className="flex h-8 items-center gap-2 px-2">
            <Skeleton className="size-5 rounded-[5px]" />
            <Skeleton className="h-3" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    );
  }
  if (spaces.isError) {
    return <ErrorState size="sm" error={spaces.error} onRetry={() => void spaces.refetch()} retrying={spaces.isFetching} />;
  }

  const items = spaces.data.items.filter((space) => space.archivedAt === null);
  const groups = [
    { key: "public", label: "Công khai", spaces: items.filter((space) => space.visibility === "public") },
    { key: "private", label: "Riêng tư", spaces: items.filter((space) => space.visibility === "private") }
  ].filter((group) => group.spaces.length > 0);

  if (groups.length === 0) {
    return (
      <div className="mx-2 flex flex-col items-start gap-2 rounded-lg border border-dashed px-3 py-3 text-[13px] text-foreground-muted">
        <p>Chưa có kho tri thức nào bạn xem được.</p>
        {canCreateSpace(permissions) ? (
          <Button size="sm" variant="outline" onClick={() => setNewSpaceOpen(true)}>
            <BookPlus />
            Tạo kho đầu tiên
          </Button>
        ) : null}
      </div>
    );
  }

  const tabStop = activeId && items.some((space) => space.id === activeId) ? activeId : items[0]?.id;

  return (
    <div className="flex flex-col gap-1.5 px-2">
      <SpaceLink to="/k" label="Tất cả kho" icon={<Library aria-hidden="true" />} active={homeMatch !== null} onNavigate={onNavigate} />
      <div role="tree" aria-label="Kho tri thức" className="flex flex-col gap-1.5">
      {groups.map((group) => (
        <div key={group.key} role="group" aria-label={group.label} className="flex flex-col gap-px">
          <p aria-hidden="true" className="flex h-6 items-center gap-1 px-2 text-[11px] font-medium text-foreground-subtle">
            {group.key === "private" ? <Lock className="size-3" /> : null}
            {group.label}
          </p>
          {group.spaces.map((space) => (
            <SpaceRow
              key={space.id}
              space={space}
              active={space.id === activeId}
              tabStop={space.id === tabStop}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
      </div>
    </div>
  );
};

const SpaceLink = ({
  to,
  label,
  icon,
  active,
  onNavigate
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onNavigate: (() => void) | undefined;
}) => (
  <Link
    to={to}
    onClick={() => onNavigate?.()}
    className={cn(
      "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-foreground-muted outline-none transition-colors duration-150 pointer-coarse:h-10 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4",
      active && "bg-brand-soft font-medium text-brand-text"
    )}
  >
    {icon}
    {label}
  </Link>
);

const focusSibling = (from: HTMLElement, step: 1 | -1 | "first" | "last") => {
  const tree = from.closest<HTMLElement>("[role=tree]");
  if (!tree) return;
  const rows = [...tree.querySelectorAll<HTMLElement>("[data-space-row]")];
  const index = rows.indexOf(from);
  const target = step === "first" ? rows[0] : step === "last" ? rows.at(-1) : rows[index + step];
  target?.focus();
};

const SpaceRow = ({
  space,
  active,
  tabStop,
  onNavigate
}: {
  space: KnowledgeSpace;
  active: boolean;
  tabStop: boolean;
  onNavigate: (() => void) | undefined;
}) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const href = `/k/${space.id}`;
  const go = (path: string) => {
    void navigate(path);
    onNavigate?.();
  };

  const actions: RowAction[] = [
    ...(space.capabilities.canManage
      ? [{ key: "settings", label: "Cài đặt kho", icon: Settings2, onSelect: () => go(`${href}/settings`) }]
      : []),
    ...(space.capabilities.canViewAudit
      ? [{ key: "audit", label: "Nhật ký kho", icon: History, onSelect: () => go(`${href}/audit`) }]
      : []),
    ...(space.capabilities.canEdit || space.capabilities.canManage
      ? [{ key: "trash", label: "Thùng rác của kho", icon: Trash2, onSelect: () => go(`${href}/trash`) }]
      : [])
  ];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusSibling(event.currentTarget, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusSibling(event.currentTarget, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusSibling(event.currentTarget, "first");
    } else if (event.key === "End") {
      event.preventDefault();
      focusSibling(event.currentTarget, "last");
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(href);
    } else if ((event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) && actions.length > 0) {
      event.preventDefault();
      setMenuOpen(true);
    }
  };

  return (
    <ActionsContextMenu actions={actions}>
      <div
        ref={rowRef}
        role="treeitem"
        aria-selected={active}
        aria-label={`${space.name}${space.visibility === "private" ? ", riêng tư" : ""}`}
        tabIndex={tabStop ? 0 : -1}
        data-space-row=""
        onKeyDown={onKeyDown}
        className={cn(
          "group/row relative flex h-8 items-center gap-2 rounded-md pr-1 pl-2 text-[13px] text-foreground/85 outline-none select-none pointer-coarse:h-10",
          "transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          active && "bg-brand-soft font-medium text-brand-text hover:bg-brand-soft hover:text-brand-text"
        )}
      >
        <ProjectIcon color={space.color} icon={space.icon} name={space.name} size="sm" />
        <Link
          to={href}
          tabIndex={-1}
          onClick={() => onNavigate?.()}
          className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 after:rounded-md"
        >
          {space.name}
        </Link>
        {space.archivedAt ? <Archive aria-label="Đã lưu trữ" className="size-3 shrink-0 text-foreground-subtle" /> : null}
        {space.visibility === "private" ? (
          <Lock aria-label="Riêng tư" className="size-3 shrink-0 text-foreground-subtle" />
        ) : null}
        {actions.length > 0 ? (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100">
            <ActionsDropdown
              actions={actions}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              finalFocus={rowRef}
              triggerLabel={`Tùy chọn kho ${space.name}`}
              triggerClassName="relative z-[1] flex size-6 items-center justify-center rounded-md text-foreground-muted outline-none pointer-coarse:size-8 hover:bg-border/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-border/70 [&_svg]:size-3.5"
              trigger={<Ellipsis />}
            />
          </div>
        ) : null}
      </div>
    </ActionsContextMenu>
  );
};
