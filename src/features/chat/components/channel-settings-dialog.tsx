import { cn } from "cn";
import {
  Archive,
  ArchiveRestore,
  Globe,
  Lock,
  LogOut,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ChannelNameSchema,
  chatLimits,
  isDirectKind,
  type ChannelAccess,
  type ChatChannelDetail,
  type ChatChannelMember,
  type NamedChannelKind
} from "@/contracts/chat";
import type { UserRef } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { useDebouncedValue } from "@/features/command/search-api";
import { isApiError } from "@/lib/api/errors";

import { chatErrorMessage } from "../errors";
import {
  useArchiveChannel,
  useChannelMembers,
  useDeleteChannel,
  useLeaveChannel,
  useMemberMutations,
  useNotifyLevel,
  useOpenDm,
  useUpdateChannel
} from "../hooks/use-channels";
import { channelLabel, channelTitle } from "../model/channels";
import { notifyOptions } from "../model/notify";
import { PeoplePicker } from "./people-picker";

export type SettingsTab = "about" | "members" | "settings";

/** Channel details, members and personal settings (Slack-style "about this channel"). */
export const ChannelSettingsDialog = ({
  channel,
  open,
  tab,
  onTabChange,
  onOpenChange
}: {
  channel: ChatChannelDetail;
  open: boolean;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const direct = isDirectKind(channel.kind);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(86vh,680px)] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="gap-1 border-b px-5 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {direct ? (
              <Users className="size-4 text-foreground-muted" aria-hidden="true" />
            ) : channel.kind === "private" ? (
              <Lock className="size-4 text-foreground-muted" aria-hidden="true" />
            ) : (
              <Globe className="size-4 text-foreground-muted" aria-hidden="true" />
            )}
            <span className="truncate">{channelLabel(channel)}</span>
          </DialogTitle>
          <DialogDescription>
            {direct
              ? "Cuộc trò chuyện trực tiếp"
              : `${channel.kind === "private" ? "Kênh riêng tư" : "Kênh công khai"} · ${channel.memberCount} thành viên${channel.archivedAt ? " · Đã lưu trữ" : ""}`}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as SettingsTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList variant="line" className="w-full justify-start border-b px-4">
            <TabsTrigger value="about" className="flex-none px-2">
              Giới thiệu
            </TabsTrigger>
            <TabsTrigger value="members" className="flex-none px-2">
              Thành viên
              <span className="text-xs text-foreground-subtle tabular-nums">
                {channel.memberCount}
              </span>
            </TabsTrigger>
            {channel.isMember ? (
              <TabsTrigger value="settings" className="flex-none px-2">
                Cài đặt
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="about" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {direct ? (
              <DirectAbout channel={channel} onDone={() => onOpenChange(false)} />
            ) : (
              <AboutTab channel={channel} />
            )}
          </TabsContent>
          <TabsContent value="members" className="flex min-h-0 flex-1 flex-col">
            <MembersTab channel={channel} />
          </TabsContent>
          {channel.isMember ? (
            <TabsContent value="settings" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <SettingsTabPanel channel={channel} onClose={() => onOpenChange(false)} />
            </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

// About -----------------------------------------------------------------------------------------------

const AboutTab = ({ channel }: { channel: ChatChannelDetail }) => {
  const ids = useId();
  const update = useUpdateChannel(channel.id);
  const editable = channel.capabilities.canUpdate && !channel.archivedAt;
  const [name, setName] = useState(channel.name ?? "");
  const [description, setDescription] = useState(channel.description ?? "");
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<NamedChannelKind | null>(null);

  const dirty =
    name.trim() !== (channel.name ?? "") ||
    description.trim() !== (channel.description ?? "") ||
    topic.trim() !== (channel.topic ?? "");

  const save = () => {
    const parsed = ChannelNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError("Tên kênh cần từ 1 đến 80 ký tự.");
      return;
    }
    setNameError(null);
    update.mutate(
      {
        ...(parsed.data !== channel.name ? { name: parsed.data } : {}),
        ...(description.trim() !== (channel.description ?? "")
          ? { description: description.trim() || null }
          : {}),
        ...(topic.trim() !== (channel.topic ?? "") ? { topic: topic.trim() || null } : {})
      },
      {
        onSuccess: () => toast.success("Đã lưu thông tin kênh"),
        onError: (error) => {
          if (isApiError(error) && error.code === "CHANNEL_NAME_TAKEN")
            setNameError(chatErrorMessage(error));
          else toast.error(chatErrorMessage(error));
        }
      }
    );
  };

  const changeKind = (kind: NamedChannelKind) =>
    update.mutate(
      { kind },
      {
        onSuccess: () =>
          toast.success(
            kind === "private" ? "Kênh đã chuyển sang riêng tư" : "Kênh đã chuyển sang công khai"
          ),
        onError: (error) => toast.error(chatErrorMessage(error))
      }
    );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) save();
      }}
    >
      <Field data-invalid={Boolean(nameError)}>
        <FieldLabel htmlFor={`${ids}-name`}>Tên kênh</FieldLabel>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={chatLimits.channelNameMax + 2}
          disabled={!editable}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(nameError)}
        />
        <FieldError>{nameError}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${ids}-topic`}>Chủ đề</FieldLabel>
        <Input
          id={`${ids}-topic`}
          value={topic}
          maxLength={chatLimits.topicMax}
          disabled={!editable}
          placeholder={editable ? "Mọi người đang trao đổi về điều gì?" : "Chưa đặt chủ đề"}
          onChange={(event) => setTopic(event.target.value)}
        />
        <FieldDescription className="text-xs">
          Hiển thị ở đầu kênh cho mọi thành viên.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${ids}-description`}>Mô tả</FieldLabel>
        <Textarea
          id={`${ids}-description`}
          rows={3}
          value={description}
          maxLength={chatLimits.descriptionMax}
          disabled={!editable}
          placeholder={editable ? "Kênh này dùng để làm gì?" : "Chưa có mô tả"}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      {editable ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty}
            onClick={() => {
              setName(channel.name ?? "");
              setDescription(channel.description ?? "");
              setTopic(channel.topic ?? "");
              setNameError(null);
            }}
          >
            Hoàn tác
          </Button>
          <Button type="submit" disabled={!dirty || update.isPending}>
            {update.isPending ? <Spinner /> : null}
            Lưu thay đổi
          </Button>
        </div>
      ) : null}

      {channel.capabilities.canChangeKind && !channel.archivedAt ? (
        <div className="flex flex-col gap-2 border-t pt-4">
          <span className="text-sm font-medium" id={`${ids}-kind`}>
            Quyền truy cập
          </span>
          <SegmentedControl
            aria-labelledby={`${ids}-kind`}
            value={channel.kind as NamedChannelKind}
            onChange={(kind) => kind !== channel.kind && setConfirmKind(kind)}
            options={[
              { value: "public", label: "Công khai", icon: Globe },
              { value: "private", label: "Riêng tư", icon: Lock }
            ]}
            className="w-full sm:w-80"
          />
          <p className="text-xs text-foreground-muted">
            {channel.kind === "public"
              ? "Mọi người trong tổ chức có thể tìm và tham gia kênh."
              : "Chỉ thành viên thấy kênh. Quản trị kênh mời thêm người."}
          </p>
        </div>
      ) : null}

      <AlertDialog
        open={confirmKind !== null}
        onOpenChange={(open) => !open && setConfirmKind(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmKind === "private"
                ? "Chuyển kênh sang riêng tư?"
                : "Chuyển kênh sang công khai?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind === "private"
                ? "Người chưa tham gia sẽ không còn tìm thấy hay xem trước kênh. Thành viên hiện tại vẫn ở lại."
                : "Mọi người trong tổ chức sẽ tìm thấy, xem trước và tự tham gia kênh, kể cả lịch sử tin nhắn."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmKind) changeKind(confirmKind);
                setConfirmKind(null);
              }}
            >
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
};

/** DM "about": participants are fixed; adding people starts a new group conversation. */
const DirectAbout = ({ channel, onDone }: { channel: ChatChannelDetail; onDone: () => void }) => {
  const session = useSessionContext();
  const openDm = useOpenDm();
  const [adding, setAdding] = useState<UserRef[]>([]);
  const existing = useMemo(
    () => new Set([session.user.id, ...channel.participants.map((user) => user.id)]),
    [channel.participants, session.user.id]
  );
  const room = chatLimits.dmOthersMax - channel.participants.length;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Người tham gia</span>
        <ul className="flex flex-col gap-1">
          {channel.participants.map((user) => (
            <li key={user.id} className="flex items-center gap-2.5 rounded-md py-1">
              <UserAvatar user={user} size="md" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">{user.displayName}</span>
                <span className="truncate text-xs text-foreground-muted">{user.email ?? ""}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2 border-t pt-4">
        <span className="text-sm font-medium">Thêm người vào cuộc trò chuyện</span>
        <p className="text-xs text-foreground-muted">
          Người tham gia của tin nhắn trực tiếp là cố định. Thêm người sẽ tạo một nhóm trò chuyện
          mới gồm {channelTitle(channel)} và những người bạn chọn.
        </p>
        {room > 0 ? (
          <>
            <PeoplePicker
              selected={adding}
              onChange={setAdding}
              excludeIds={existing}
              max={room}
              listClassName="max-h-44"
            />
            <div className="flex justify-end">
              <Button
                disabled={adding.length === 0 || openDm.isPending}
                onClick={() =>
                  openDm.mutate(
                    [
                      ...channel.participants.map((user) => user.id),
                      ...adding.map((user) => user.id)
                    ],
                    { onSuccess: onDone }
                  )
                }
              >
                {openDm.isPending ? <Spinner /> : <UserPlus />}
                Tạo nhóm trò chuyện
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-foreground-muted">
            Nhóm đã đạt tối đa {chatLimits.dmOthersMax + 1} người.
          </p>
        )}
      </div>
    </div>
  );
};

// Members ---------------------------------------------------------------------------------------------

const accessLabels: Record<ChannelAccess, string> = { submit: "Gửi tin", view: "Chỉ xem" };

const MembersTab = ({ channel }: { channel: ChatChannelDetail }) => {
  const session = useSessionContext();
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q.trim(), 200);
  const members = useChannelMembers(
    channel.id,
    debounced,
    channel.capabilities.canRead || channel.isMember
  );
  const mutations = useMemberMutations(channel.id);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<UserRef[]>([]);
  const [access, setAccess] = useState<ChannelAccess>("submit");
  const [toRemove, setToRemove] = useState<ChatChannelMember | null>(null);
  const direct = isDirectKind(channel.kind);
  const canManage = channel.capabilities.canManageMembers && !direct && !channel.archivedAt;
  const items = useMemo(
    () => members.data?.pages.flatMap((page) => page.items) ?? [],
    [members.data]
  );
  const existing = useMemo(() => new Set(items.map((member) => member.user.id)), [items]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Tìm thành viên…"
            aria-label="Tìm thành viên"
            className="pl-8"
          />
        </div>
        {canManage ? (
          <Button
            variant={adding ? "secondary" : "default"}
            onClick={() => setAdding((value) => !value)}
          >
            <UserPlus />
            Thêm
          </Button>
        ) : null}
      </div>

      {adding && canManage ? (
        <div className="flex flex-col gap-2.5 border-b bg-muted/30 px-5 py-3">
          <PeoplePicker
            autoFocus
            selected={toAdd}
            onChange={setToAdd}
            excludeIds={existing}
            max={chatLimits.addMembersMax}
            listClassName="max-h-40"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              aria-label="Quyền của thành viên mới"
              size="sm"
              value={access}
              onChange={setAccess}
              options={[
                { value: "submit", label: "Gửi tin" },
                { value: "view", label: "Chỉ xem" }
              ]}
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Hủy
              </Button>
              <Button
                size="sm"
                disabled={toAdd.length === 0 || mutations.add.isPending}
                onClick={() =>
                  mutations.add.mutate(
                    { userIds: toAdd.map((user) => user.id), access },
                    {
                      onSuccess: () => {
                        setToAdd([]);
                        setAdding(false);
                      }
                    }
                  )
                }
              >
                {mutations.add.isPending ? <Spinner /> : null}
                Thêm {toAdd.length > 0 ? toAdd.length : ""} người
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {members.isPending ? (
          <div className="flex flex-col gap-1 p-2" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-3 py-1.5">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : members.isError ? (
          <ErrorState size="sm" error={members.error} onRetry={() => void members.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Users}
            title={debounced ? "Không tìm thấy thành viên" : "Kênh chưa có thành viên"}
          />
        ) : (
          <ul className="flex flex-col">
            {items.map((member) => (
              <MemberRow
                key={member.user.id}
                member={member}
                isSelf={member.user.id === session.user.id}
                canManage={canManage}
                onAccess={(next) =>
                  mutations.update.mutate({ userId: member.user.id, access: next })
                }
                onRole={(role) => mutations.update.mutate({ userId: member.user.id, role })}
                onRemove={() => setToRemove(member)}
              />
            ))}
            {members.hasNextPage ? (
              <li className="flex justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={members.isFetchingNextPage}
                  onClick={() => void members.fetchNextPage()}
                >
                  {members.isFetchingNextPage ? <Spinner /> : null}
                  Tải thêm
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <AlertDialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa {toRemove?.user.displayName} khỏi kênh?</AlertDialogTitle>
            <AlertDialogDescription>
              {channel.kind === "private"
                ? "Họ sẽ không còn thấy kênh và tin nhắn. Bạn có thể mời lại sau."
                : "Họ sẽ rời kênh nhưng vẫn có thể tự tham gia lại vì kênh công khai."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (toRemove) mutations.remove.mutate(toRemove.user.id);
                setToRemove(null);
              }}
            >
              Xóa khỏi kênh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const MemberRow = ({
  member,
  isSelf,
  canManage,
  onAccess,
  onRole,
  onRemove
}: {
  member: ChatChannelMember;
  isSelf: boolean;
  canManage: boolean;
  onAccess: (access: ChannelAccess) => void;
  onRole: (role: "admin" | "member") => void;
  onRemove: () => void;
}) => (
  <li className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-hover/60">
    <UserAvatar user={member.user} size="md" />
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-[13px] font-medium">
        {member.user.displayName}
        {isSelf ? <span className="font-normal text-foreground-muted"> (bạn)</span> : null}
      </span>
      <span className="truncate text-xs text-foreground-muted">{member.user.email ?? ""}</span>
    </div>
    {member.role === "admin" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">
        <ShieldCheck className="size-3" aria-hidden="true" />
        Quản trị
      </span>
    ) : null}
    {member.access === "view" ? (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
        Chỉ xem
      </span>
    ) : null}
    {canManage && !isSelf ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Thao tác với ${member.user.displayName}`}
          className="flex size-7 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-surface-hover"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Quyền trong kênh</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={member.access}
              onValueChange={(value) => value !== member.access && onAccess(value as ChannelAccess)}
            >
              <DropdownMenuRadioItem value="submit" disabled={member.role === "admin"}>
                {accessLabels.submit}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="view" disabled={member.role === "admin"}>
                {accessLabels.view}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onRole(member.role === "admin" ? "member" : "admin")}>
            <ShieldCheck />
            {member.role === "admin" ? "Bỏ quyền quản trị" : "Đặt làm quản trị kênh"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2 />
            Xóa khỏi kênh
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null}
  </li>
);

// Settings --------------------------------------------------------------------------------------------

const SettingsTabPanel = ({
  channel,
  onClose
}: {
  channel: ChatChannelDetail;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const notify = useNotifyLevel(channel.id);
  const archive = useArchiveChannel(channel.id);
  const remove = useDeleteChannel(channel.id);
  const leave = useLeaveChannel(channel.id);
  const [confirm, setConfirm] = useState<"leave" | "archive" | "delete" | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const direct = isDirectKind(channel.kind);
  const level = channel.notifyLevel ?? "all";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-labelledby="notify-heading">
        <h3 id="notify-heading" className="text-sm font-medium">
          Thông báo
        </h3>
        <div role="radiogroup" aria-labelledby="notify-heading" className="flex flex-col gap-1.5">
          {notifyOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={level === option.value}
              onClick={() => level !== option.value && notify.mutate(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                level === option.value ? "border-brand/50 bg-brand-soft" : "hover:bg-surface-hover"
              )}
            >
              <option.icon
                className={cn(
                  "mt-0.5 size-4",
                  level === option.value ? "text-brand-text" : "text-foreground-muted"
                )}
                aria-hidden="true"
              />
              <span className="flex flex-col">
                <span className="text-[13px] font-medium">{option.label}</span>
                <span className="text-xs text-foreground-muted">{option.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {!direct ? (
        <section className="flex flex-col gap-2 border-t pt-5">
          <h3 className="text-sm font-medium">Kênh</h3>
          {channel.capabilities.canLeave ? (
            <SettingRow
              icon={LogOut}
              title="Rời kênh"
              description={
                channel.kind === "private"
                  ? "Bạn sẽ cần được mời lại để quay lại kênh riêng tư."
                  : "Bạn có thể tham gia lại bất cứ lúc nào."
              }
              action={
                <Button variant="outline" size="sm" onClick={() => setConfirm("leave")}>
                  Rời kênh
                </Button>
              }
            />
          ) : null}
          {leaveError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
              {leaveError}
            </p>
          ) : null}
          {channel.capabilities.canArchive ? (
            <SettingRow
              icon={channel.archivedAt ? ArchiveRestore : Archive}
              title={channel.archivedAt ? "Khôi phục kênh" : "Lưu trữ kênh"}
              description={
                channel.archivedAt
                  ? "Thành viên có thể gửi tin trở lại."
                  : "Kênh chuyển sang chỉ xem; lịch sử vẫn được giữ nguyên."
              }
              action={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={archive.isPending}
                  onClick={() =>
                    channel.archivedAt ? archive.mutate(false) : setConfirm("archive")
                  }
                >
                  {archive.isPending ? <Spinner /> : null}
                  {channel.archivedAt ? "Khôi phục" : "Lưu trữ"}
                </Button>
              }
            />
          ) : null}
          {channel.capabilities.canDelete ? (
            <SettingRow
              icon={Trash2}
              title="Xóa kênh"
              danger
              description="Xóa vĩnh viễn kênh và toàn bộ tin nhắn với mọi thành viên."
              action={
                <Button variant="destructive" size="sm" onClick={() => setConfirm("delete")}>
                  Xóa kênh
                </Button>
              }
            />
          ) : null}
        </section>
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "leave"
                ? `Rời ${channelLabel(channel)}?`
                : confirm === "archive"
                  ? `Lưu trữ ${channelLabel(channel)}?`
                  : `Xóa ${channelLabel(channel)}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "leave"
                ? "Bạn sẽ không còn nhận tin nhắn và thông báo từ kênh này."
                : confirm === "archive"
                  ? "Không ai gửi được tin mới cho tới khi kênh được khôi phục."
                  : "Thao tác này không thể hoàn tác. Nhập tên kênh để xác nhận."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "delete" ? (
            <Input
              autoFocus
              value={deleteName}
              onChange={(event) => setDeleteName(event.target.value)}
              placeholder={channel.name ?? ""}
              aria-label="Nhập tên kênh để xác nhận"
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "archive" ? "default" : "destructive"}
              disabled={confirm === "delete" && deleteName.trim() !== (channel.name ?? "")}
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === "leave") {
                  setLeaveError(null);
                  leave.mutate(undefined, {
                    onSuccess: () => {
                      onClose();
                      void navigate(channel.kind === "public" ? `/c/${channel.id}` : "/c", {
                        replace: true
                      });
                    },
                    onError: (error) => setLeaveError(chatErrorMessage(error))
                  });
                } else if (action === "archive") {
                  archive.mutate(true);
                } else if (action === "delete") {
                  onClose();
                  remove.mutate();
                }
              }}
            >
              {confirm === "leave"
                ? "Rời kênh"
                : confirm === "archive"
                  ? "Lưu trữ"
                  : "Xóa vĩnh viễn"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const SettingRow = ({
  icon: Icon,
  title,
  description,
  action,
  danger = false
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: React.ReactNode;
  danger?: boolean;
}) => (
  <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
    <Icon
      className={cn("size-4 shrink-0", danger ? "text-danger" : "text-foreground-muted")}
      aria-hidden="true"
    />
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="text-[13px] font-medium">{title}</span>
      <span className="text-xs text-foreground-muted">{description}</span>
    </div>
    {action}
  </div>
);
