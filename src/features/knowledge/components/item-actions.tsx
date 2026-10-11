import { cn } from "cn";
import {
  Bell,
  BellOff,
  BellRing,
  ChevronDown,
  Ellipsis,
  History,
  Link2,
  Pencil,
  Pin,
  PinOff,
  Trash2
} from "lucide-react";
import { Fragment, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { KnowledgeImportance, KnowledgeItemDetail, KnowledgeSpaceDetail } from "@/contracts/knowledge";
import { toneClass } from "@/lib/colors";

import { knowledgeErrorMessage } from "../errors";
import { useDeleteItem, useFollowItem, useRestoreItem, useTogglePin } from "../hooks";
import { itemActions, reasonRequired, statusChoices } from "../model/access";
import { importanceMeta, importanceOrder, statusGroupMeta, statusGroupOrder } from "../model/labels";
import type { useItemFieldChange } from "../use-item-change";
import { ImportanceBadge, KnowledgeStatusChip } from "./badges";
import { ReasonDialog } from "./reason-dialog";

type Change = ReturnType<typeof useItemFieldChange>["change"];

/** Status chip; a menu of the statuses the caller may move to (approval rule applied by the server). */
export const ItemStatusMenu = ({
  item,
  space,
  change,
  disabled
}: {
  item: KnowledgeItemDetail;
  space: KnowledgeSpaceDetail;
  change: Change;
  disabled?: boolean;
}) => {
  const choices = statusChoices(space.statuses, item);
  const allowed = itemActions(item, space).changeStatus && choices.length > 0 && !disabled;
  if (!allowed) return <KnowledgeStatusChip status={item.status} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Trạng thái: ${item.status.name}. Đổi trạng thái`}
        className="group/status inline-flex items-center gap-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:-my-2 pointer-coarse:py-2"
      >
        <KnowledgeStatusChip status={item.status} className="pr-1" />
        <ChevronDown className="size-3.5 text-foreground-subtle transition-transform group-data-popup-open/status:rotate-180" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {statusGroupOrder.map((group, index) => {
          const inGroup = choices.filter((status) => status.group === group);
          if (inGroup.length === 0) return null;
          return (
            <Fragment key={group}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup>
                <DropdownMenuLabel>{statusGroupMeta[group].label}</DropdownMenuLabel>
                {inGroup.map((status) => (
                  <DropdownMenuItem
                    key={status.id}
                    onClick={() =>
                      change({
                        patch: { statusId: status.id },
                        title: `Chuyển sang “${status.name}”?`,
                        confirmLabel: "Đổi trạng thái",
                        success: `Đã chuyển sang “${status.name}”`
                      })
                    }
                  >
                    <span aria-hidden="true" className={cn(toneClass(status.color), "size-2 shrink-0 rounded-full bg-(--tone)")} />
                    {status.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </Fragment>
          );
        })}
        {space.approvalRequired && !space.capabilities.canManage ? (
          <p className="px-2 pt-2 pb-1 text-[11px] leading-snug text-foreground-subtle">
            Kho đang bật bước duyệt: Quản lý kho sẽ ban hành mục.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Importance badge; editors change it from a menu (reason required around "Rất quan trọng"). */
export const ItemImportanceMenu = ({
  item,
  space,
  change,
  disabled
}: {
  item: KnowledgeItemDetail;
  space: KnowledgeSpaceDetail;
  change: Change;
  disabled?: boolean;
}) => {
  if (!itemActions(item, space).changeImportance || disabled) {
    return <ImportanceBadge importance={item.importance} showNormal />;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Mức quan trọng: ${importanceMeta[item.importance].label}. Đổi mức`}
        className="group/imp inline-flex items-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:-my-2 pointer-coarse:py-2"
      >
        <ImportanceBadge importance={item.importance} showNormal />
        <ChevronDown className="size-3.5 text-foreground-subtle transition-transform group-data-popup-open/imp:rotate-180" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mức quan trọng</DropdownMenuLabel>
          {importanceOrder.map((importance: KnowledgeImportance) => (
            <DropdownMenuItem
              key={importance}
              disabled={importance === item.importance}
              onClick={() =>
                change({
                  patch: { importance },
                  title: `Đổi mức thành “${importanceMeta[importance].label}”?`,
                  confirmLabel: "Đổi mức",
                  success: `Đã đổi mức thành “${importanceMeta[importance].label}”`
                })
              }
              className="items-start"
            >
              <span aria-hidden="true" className={cn(toneClass(importanceMeta[importance].color), "mt-1.5 size-2 shrink-0 rounded-full bg-(--tone)")} />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{importanceMeta[importance].label}</span>
                <span className="text-[11px] leading-snug text-foreground-muted">{importanceMeta[importance].description}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * Item toolbar: Theo dõi, Ghim, "Sửa" and a menu (copy link, history, move to trash). Deleting a critical
 * item asks for a reason; every deletion can be undone from the toast or the space trash (30 days).
 */
export const ItemToolbar = ({
  item,
  space,
  onShowHistory,
  compact
}: {
  item: KnowledgeItemDetail;
  space: KnowledgeSpaceDetail;
  onShowHistory: () => void;
  /** Phones: icon-only buttons. */
  compact: boolean;
}) => {
  const navigate = useNavigate();
  const actions = itemActions(item, space);
  const follow = useFollowItem(item);
  const pin = useTogglePin(item);
  const remove = useDeleteItem(item.spaceId);
  const restore = useRestoreItem(item.spaceId);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pinAsking, setPinAsking] = useState(false);
  const editHref = `/k/${item.spaceId}/i/${item.id}/edit`;
  // Pinning a "Rất quan trọng" item is a change like any other: it asks for the reason first.
  const togglePin = () => (reasonRequired(item.importance) ? setPinAsking(true) : pin.mutate({ pinned: !item.pinned }));

  const copyLink = async () => {
    const url = `${window.location.origin}/k/${item.spaceId}/i/${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã sao chép liên kết");
    } catch {
      toast.error("Không sao chép được. Hãy sao chép từ thanh địa chỉ.");
    }
  };

  const confirmDelete = (reason: string | undefined) => {
    setDeleteError(null);
    remove.mutate(
      { itemId: item.id, ...(reason ? { reason } : {}) },
      {
        onSuccess: () => {
          setDeleting(false);
          void navigate(`/k/${item.spaceId}`, { replace: true });
          toast.success("Đã chuyển mục vào thùng rác", {
            description: "Mục được giữ 30 ngày trong thùng rác của kho.",
            action:
              item.importance === "critical"
                ? undefined
                : {
                    label: "Hoàn tác",
                    onClick: () =>
                      restore.mutate(
                        { itemId: item.id },
                        {
                          onSuccess: () => toast.success("Đã khôi phục mục"),
                          onError: (error) => toast.error(knowledgeErrorMessage(error, "Không khôi phục được mục."))
                        }
                      )
                  }
          });
        },
        onError: (error) => setDeleteError(knowledgeErrorMessage(error, "Không xoá được mục."))
      }
    );
  };

  const iconButton = (label: string, onClick: () => void, icon: React.ReactNode, active = false, busy = false) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={active}
            disabled={busy}
            onClick={onClick}
            className={cn("text-foreground-muted", active && "text-brand-text")}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex items-center gap-1">
      {compact ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={item.isFollowing}
                disabled={follow.isPending}
                onClick={() => follow.mutate(!item.isFollowing)}
                className={cn("text-foreground-muted", item.isFollowing && "text-brand-text")}
              />
            }
          >
            {item.isFollowing ? <BellRing /> : <Bell />}
            {item.isFollowing ? "Đang theo dõi" : "Theo dõi"}
          </TooltipTrigger>
          <TooltipContent>
            {item.isFollowing ? "Bấm để bỏ theo dõi" : "Nhận thông báo khi có bình luận, phiên bản mới hoặc đổi trạng thái"}
          </TooltipContent>
        </Tooltip>
      )}
      {actions.pin && !compact
        ? iconButton(
            item.pinned ? "Bỏ ghim khỏi đầu kho" : "Ghim lên đầu kho",
            togglePin,
            <Pin className={cn("rotate-45", item.pinned && "fill-current")} />,
            item.pinned,
            pin.isPending
          )
        : null}
      {actions.edit ? (
        <Button size="sm" onClick={() => void navigate(editHref)} aria-label={compact ? "Sửa mục" : undefined}>
          <Pencil />
          {compact ? null : "Sửa"}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Thêm thao tác" className="text-foreground-muted" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {compact ? (
            <DropdownMenuItem onClick={() => follow.mutate(!item.isFollowing)}>
              {item.isFollowing ? <BellOff /> : <Bell />}
              {item.isFollowing ? "Bỏ theo dõi" : "Theo dõi mục này"}
            </DropdownMenuItem>
          ) : null}
          {compact && actions.pin ? (
            <DropdownMenuItem onClick={togglePin}>
              {item.pinned ? <PinOff /> : <Pin className="rotate-45" />}
              {item.pinned ? "Bỏ ghim" : "Ghim lên đầu kho"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => void copyLink()}>
            <Link2 />
            Sao chép liên kết
          </DropdownMenuItem>
          {actions.history ? (
            <DropdownMenuItem onClick={onShowHistory}>
              <History />
              Lịch sử và phiên bản
            </DropdownMenuItem>
          ) : null}
          {actions.delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                <Trash2 />
                Xoá vào thùng rác
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReasonDialog
        open={deleting}
        onOpenChange={(open) => {
          setDeleting(open);
          if (!open) setDeleteError(null);
        }}
        title={`Xoá “${item.title}”?`}
        description="Mục được chuyển vào thùng rác của kho và giữ 30 ngày; người có quyền có thể khôi phục về đúng chuyên mục cũ. Thao tác được ghi vào nhật ký."
        confirmLabel="Xoá vào thùng rác"
        destructive
        reason={reasonRequired(item.importance) ? "required" : "none"}
        pending={remove.isPending}
        error={deleteError}
        onConfirm={confirmDelete}
      />
      <ReasonDialog
        open={pinAsking}
        onOpenChange={setPinAsking}
        title={item.pinned ? `Bỏ ghim “${item.title}”?` : `Ghim “${item.title}” lên đầu kho?`}
        description="Mục Rất quan trọng: thay đổi được ghi vào nhật ký kèm lý do."
        confirmLabel={item.pinned ? "Bỏ ghim" : "Ghim"}
        reason="required"
        pending={pin.isPending}
        onConfirm={(reason) => pin.mutate({ pinned: !item.pinned, reason }, { onSuccess: () => setPinAsking(false) })}
      />
    </div>
  );
};
