import { cn } from "cn";
import { LogOut, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type {
  KnowledgeAccessLevel,
  KnowledgeMember,
  KnowledgeSpaceDetail
} from "@/contracts/knowledge";
import { P } from "@/features/auth/permissions";
import { usePermissions, useSessionContext } from "@/features/auth/hooks";
import { useDebouncedValue } from "@/features/command/search-api";
import { useDirectory } from "@/features/tasks/hooks";
import { getErrorMessage } from "@/lib/api/errors";

import { useKnowledgeMemberMutations, useKnowledgeMembers } from "../../hooks";
import { accessLevelMeta, accessLevelOrder } from "../../model/labels";
import { SettingsSection } from "./settings-section";

const accessItems = accessLevelOrder.map((value) => ({
  value,
  label: accessLevelMeta[value].label
}));
const levelRank: Record<KnowledgeAccessLevel, number> = { manage: 0, submit: 1, view: 2 };

/** Managers first, then Thành viên, then Chỉ xem; by name inside each level. */
const sortMembers = (members: readonly KnowledgeMember[]) =>
  [...members].sort(
    (a, b) =>
      levelRank[a.accessLevel] - levelRank[b.accessLevel] ||
      a.user.displayName.localeCompare(b.user.displayName, "vi", { sensitivity: "base" })
  );

/** Changes to my own access lock me out of the settings: they are confirmed first. */
type SelfChange = { kind: "demote"; accessLevel: KnowledgeAccessLevel } | { kind: "leave" };

export const SpaceMembersSection = ({
  space,
  canManage
}: {
  space: KnowledgeSpaceDetail;
  canManage: boolean;
}) => {
  const id = useId();
  const session = useSessionContext();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const members = useKnowledgeMembers(space.id);
  const mutations = useKnowledgeMemberMutations(space.id);
  const [selfChange, setSelfChange] = useState<SelfChange | null>(null);
  const items = useMemo(() => sortMembers(members.data?.items ?? []), [members.data]);
  const managers = items.filter((member) => member.accessLevel === "manage").length;
  const lastManagerHint = `${id}-last-manager`;

  const changeLevel = (member: KnowledgeMember, accessLevel: KnowledgeAccessLevel) => {
    if (accessLevel === member.accessLevel) return;
    if (member.user.id === session.user.id && member.accessLevel === "manage") {
      setSelfChange({ kind: "demote", accessLevel });
      return;
    }
    mutations.update.mutate({ userId: member.user.id, accessLevel });
  };

  const remove = (member: KnowledgeMember) => {
    if (member.user.id === session.user.id) {
      setSelfChange({ kind: "leave" });
      return;
    }
    mutations.remove.mutate(member.user.id);
  };

  // Failures are already toasted by the shared mutation handler; the dialog only needs to close.
  const confirmSelfChange = async () => {
    if (!selfChange) return;
    try {
      if (selfChange.kind === "demote") {
        await mutations.update.mutateAsync({
          userId: session.user.id,
          accessLevel: selfChange.accessLevel
        });
        setSelfChange(null);
      } else {
        await mutations.remove.mutateAsync(session.user.id);
        setSelfChange(null);
        if (space.visibility === "private") void navigate("/k", { replace: true });
      }
    } catch {
      setSelfChange(null);
    }
  };

  const selfPending = mutations.update.isPending || mutations.remove.isPending;
  const selfDialog =
    selfChange?.kind === "demote"
      ? {
          title: `Đổi quyền của bạn thành “${accessLevelMeta[selfChange.accessLevel].label}”?`,
          description:
            "Bạn sẽ không còn quản lý kho này: không đổi được cài đặt, thành viên và trạng thái nữa.",
          action: "Đổi quyền"
        }
      : {
          title: `Rời khỏi kho “${space.name}”?`,
          description:
            space.visibility === "private"
              ? "Kho riêng tư: bạn sẽ không còn thấy kho này cho tới khi được mời lại."
              : "Bạn vẫn đọc và bình luận được vì kho công khai, nhưng không còn sửa hay quản lý kho.",
          action: "Rời kho"
        };

  return (
    <SettingsSection
      id={`${id}-members`}
      title={
        <>
          Thành viên
          <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-foreground-muted tabular-nums">
            {members.data ? items.length : space.memberCount}
          </span>
        </>
      }
      description={
        space.visibility === "public"
          ? "Kho công khai: mọi người có quyền xem tri thức đều đọc, bình luận và @nhắc tên được. Chỉ người trong danh sách này (Thành viên, Quản lý) mới sửa được."
          : "Kho riêng tư: chỉ những người dưới đây thấy kho. Người khác không thấy kho trong danh sách hay kết quả tìm kiếm."
      }
      actions={
        canManage && can(P.MemberView) ? (
          <AddMemberPicker
            existingIds={new Set(items.map((member) => member.user.id))}
            pending={mutations.add.isPending}
            onAdd={(userId, accessLevel) => mutations.add.mutate({ userId, accessLevel })}
          />
        ) : null
      }
    >
      {members.isPending ? (
        <SkeletonRows rows={4} />
      ) : members.isError ? (
        <ErrorState
          size="sm"
          error={members.error}
          onRetry={() => void members.refetch()}
          retrying={members.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Users}
          title="Chưa có thành viên"
          description={
            canManage
              ? "Thêm người để cùng soạn và quản lý tri thức trong kho."
              : "Quản lý kho sẽ thêm người cùng soạn tri thức."
          }
        />
      ) : (
        <ul className="-my-2 divide-y" aria-label="Thành viên của kho">
          {items.map((member) => {
            const isSelf = member.user.id === session.user.id;
            const lastManager = member.accessLevel === "manage" && managers <= 1;
            const updating =
              mutations.update.isPending && mutations.update.variables.userId === member.user.id;
            const removing =
              mutations.remove.isPending && mutations.remove.variables === member.user.id;
            return (
              <li
                key={member.user.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
              >
                <UserAvatar user={member.user} size="md" />
                {/* Phones (managers): name + email keep the first line; access and remove wrap below, indented. */}
                <div
                  className={cn(
                    "flex min-w-0 flex-1 flex-col",
                    canManage && "max-sm:basis-[calc(100%-3.5rem)]"
                  )}
                >
                  <span className="truncate text-[13px] font-medium">
                    {member.user.displayName}
                    {isSelf ? (
                      <span className="font-normal text-foreground-muted"> (bạn)</span>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-foreground-muted">
                    {member.user.email ?? "—"}
                  </span>
                </div>
                {canManage ? (
                  <>
                    <Select
                      items={accessItems}
                      value={member.accessLevel}
                      onValueChange={(value: KnowledgeAccessLevel | null) => {
                        if (value) changeLevel(member, value);
                      }}
                      disabled={lastManager || updating}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-32 max-sm:ml-11 max-sm:w-auto max-sm:flex-1"
                        aria-label={`Mức quyền của ${member.user.displayName}`}
                        aria-describedby={lastManager ? lastManagerHint : undefined}
                        title={lastManager ? "Kho cần ít nhất một Quản lý" : undefined}
                      >
                        {updating ? <Spinner className="size-3.5" /> : null}
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accessLevelOrder.map((level) => (
                          <SelectItem key={level} value={level} className="items-start py-1.5">
                            <span className="flex w-60 max-w-[calc(100vw-5rem)] flex-col gap-0.5 whitespace-normal">
                              <span className="font-medium">{accessLevelMeta[level].label}</span>
                              <span className="text-xs leading-snug text-foreground-muted">
                                {accessLevelMeta[level].description}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-foreground-subtle hover:text-danger"
                      aria-label={
                        isSelf ? "Rời khỏi kho" : `Gỡ ${member.user.displayName} khỏi kho`
                      }
                      aria-describedby={lastManager ? lastManagerHint : undefined}
                      title={
                        lastManager
                          ? "Kho cần ít nhất một Quản lý"
                          : isSelf
                            ? "Rời khỏi kho"
                            : "Gỡ khỏi kho"
                      }
                      disabled={lastManager || removing}
                      onClick={() => remove(member)}
                    >
                      {removing ? <Spinner /> : isSelf ? <LogOut /> : <Trash2 />}
                    </Button>
                  </>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground-muted">
                    {accessLevelMeta[member.accessLevel].label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && managers === 1 && !members.isPending && !members.isError ? (
        <p
          id={lastManagerHint}
          className="mt-4 flex items-start gap-1.5 text-xs text-foreground-subtle"
        >
          <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Kho luôn cần ít nhất một Quản lý: hãy đặt thêm một Quản lý trước khi hạ quyền hoặc gỡ
          người quản lý cuối cùng.
        </p>
      ) : null}

      <dl className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
        {accessLevelOrder.map((level) => (
          <div key={level} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs font-semibold">{accessLevelMeta[level].label}</dt>
            <dd className="text-xs leading-relaxed text-foreground-muted">
              {accessLevelMeta[level].description}
            </dd>
          </div>
        ))}
      </dl>
      {space.approvalRequired ? (
        <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
          Kho đang bật bước duyệt: Thành viên chỉ sửa, đổi trạng thái và xoá được mục còn ở nhóm Bản
          nháp; ban hành, cho hết hiệu lực và sửa mục đã ban hành là việc của Quản lý.
        </p>
      ) : null}

      <AlertDialog
        open={selfChange !== null}
        onOpenChange={(open) => !open && !selfPending && setSelfChange(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selfDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{selfDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={selfPending}>Hủy</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={selfPending}
              onClick={() => void confirmSelfChange()}
            >
              {selfPending ? <Spinner /> : null}
              {selfDialog.action}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
};

const AddMemberPicker = ({
  existingIds,
  pending,
  onAdd
}: {
  existingIds: ReadonlySet<string>;
  pending: boolean;
  onAdd: (userId: string, accessLevel: KnowledgeAccessLevel) => void;
}) => {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [accessLevel, setAccessLevel] = useState<KnowledgeAccessLevel>("submit");
  const q = useDebouncedValue(term, 200);
  const directory = useDirectory({ q }, open);
  const candidates = useMemo(
    () => (directory.data?.items ?? []).filter((user) => !existingIds.has(user.id)),
    [directory.data, existingIds]
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTerm("");
      }}
    >
      <PopoverTrigger render={<Button size="sm" disabled={pending} />}>
        {pending ? <Spinner /> : <UserPlus />}
        Thêm thành viên
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Tìm theo tên hoặc email…"
          />
          <div className="flex flex-col gap-1.5 border-b px-3 py-2.5">
            <span id={`${ids}-level`} className="text-xs text-foreground-muted">
              Mức quyền khi thêm
            </span>
            <SegmentedControl
              aria-labelledby={`${ids}-level`}
              size="sm"
              value={accessLevel}
              onChange={setAccessLevel}
              options={accessLevelOrder.map((level) => ({
                value: level,
                label: accessLevelMeta[level].label,
                description: accessLevelMeta[level].description
              }))}
              className="w-full"
            />
            <span className="text-[11px] leading-snug text-foreground-subtle">
              {accessLevelMeta[accessLevel].description}
            </span>
          </div>
          <CommandList>
            <CommandEmpty>
              {directory.isFetching ? (
                <span className="inline-flex items-center gap-2 text-foreground-muted">
                  <Spinner className="size-3.5" /> Đang tìm…
                </span>
              ) : directory.isError ? (
                getErrorMessage(directory.error)
              ) : (
                "Không còn ai để thêm."
              )}
            </CommandEmpty>
            {candidates.length > 0 ? (
              <CommandGroup>
                {candidates.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={user.id}
                    onSelect={() => {
                      onAdd(user.id, accessLevel);
                      setOpen(false);
                      setTerm("");
                    }}
                  >
                    <UserAvatar user={user} size="xs" />
                    <span className="truncate">{user.displayName}</span>
                    <CommandShortcut className="truncate tracking-normal text-foreground-muted">
                      {user.email}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <p className="flex items-center gap-1.5 border-t px-3 py-2 text-[11px] text-foreground-subtle">
            <Search className="size-3" aria-hidden="true" /> Chỉ hiển thị thành viên tổ chức đang
            hoạt động.
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
