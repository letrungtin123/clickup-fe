import {
  Compass,
  FolderPlus,
  Hash,
  House,
  Inbox,
  ListTodo,
  LogOut,
  MessageSquarePlus,
  Monitor,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { ColorDot } from "@/components/shared/color-dot";
import { ProjectIcon } from "@/components/shared/project-icon";
import { StatusPill } from "@/components/shared/task-meta";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { P } from "@/features/auth/permissions";
import { useLogout, usePermissions, useSessionContext } from "@/features/auth/hooks";
import { ChannelGlyph } from "@/features/chat/components/channel-glyph";
import { useChannels, useOpenDm } from "@/features/chat/hooks/use-channels";
import { channelTitle, sortChannels } from "@/features/chat/model/channels";
import { useChatDialogStore } from "@/features/chat/model/ui-state";
import { useProjects } from "@/features/projects/hooks";
import { Highlight } from "@/features/search/components/highlight";
import { excerptAround, foldText, messageHref } from "@/features/search/model";
import { taskHref } from "@/features/tasks/use-task-panel";
import { isModKey } from "@/lib/keyboard";
import { useThemeStore } from "@/stores/theme-store";
import { useUiStore } from "@/stores/ui-store";

import { useGlobalSearch } from "./search-api";
import { ShellServices } from "./shell-services";

/**
 * Global ⌘K / Ctrl+K palette: jump to conversations, navigation, actions and server-side search
 * (tasks, messages, projects, lists, people). Also hosts the app-wide shell services (chat runtime,
 * inbox runtime, chat dialogs) because it is the one component mounted on every layout tier.
 */
export const CommandPalette = () => {
  const open = useUiStore((state) => state.commandOpen);
  const setOpen = useUiStore((state) => state.setCommandOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isModKey(event, "k")) {
        event.preventDefault();
        setOpen(!useUiStore.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Bảng lệnh"
        description="Tìm dự án, công việc, tin nhắn, mọi người hoặc chạy lệnh"
        className="top-[12vh] sm:max-w-xl"
      >
        <PaletteBody onDone={() => setOpen(false)} />
      </CommandDialog>
      <ShellServices />
    </>
  );
};

const PaletteBody = ({ onDone }: { onDone: () => void }) => {
  const navigate = useNavigate();
  const session = useSessionContext();
  const [term, setTerm] = useState("");
  const projects = useProjects();
  const channels = useChannels();
  const { can } = usePermissions();
  const setNewProjectOpen = useUiStore((state) => state.setNewProjectOpen);
  const openChatDialog = useChatDialogStore((state) => state.open);
  const setMode = useThemeStore((state) => state.setMode);
  const openDm = useOpenDm();
  const { logout } = useLogout();
  const search = useGlobalSearch(term);
  const trimmed = term.trim();
  const searching = trimmed.length >= 2;

  const go = (path: string) => {
    onDone();
    void navigate(path);
  };
  const run = (action: () => void) => {
    onDone();
    action();
  };

  const projectItems = projects.data?.items ?? [];
  const conversations = sortChannels(channels.data?.items ?? [], "activity");
  const results = searching ? search.data : undefined;
  const highlightTerm = search.debouncedTerm;

  return (
    <Command
      loop
      // Server results are already ranked; local items are filtered by cmdk.
      filter={(value, query, keywords) => {
        if (value.startsWith("remote:")) return 1;
        // Accent-insensitive so "thiet ke" finds "thiết-kế".
        const haystack = foldText(`${value} ${(keywords ?? []).join(" ")}`).replace(/-/g, " ");
        return haystack.includes(foldText(query).replace(/-/g, " ")) ? 1 : 0;
      }}
    >
      <CommandInput
        autoFocus
        value={term}
        onValueChange={setTerm}
        placeholder="Tìm kiếm hoặc nhập lệnh…"
      />
      <CommandList className="max-h-[min(60vh,28rem)]">
        <CommandEmpty>
          {searching && (search.isFetching || search.isDebouncing) ? (
            <span className="inline-flex items-center gap-2 text-foreground-muted">
              <Spinner className="size-3.5" /> Đang tìm…
            </span>
          ) : (
            "Không có kết quả phù hợp."
          )}
        </CommandEmpty>

        {searching ? (
          <CommandGroup>
            <CommandItem
              value="remote:search-page"
              onSelect={() => go(`/search?q=${encodeURIComponent(trimmed)}`)}
            >
              <Search />
              <span className="min-w-0 flex-1 truncate">
                Xem tất cả kết quả cho “<span className="font-medium">{trimmed}</span>”
              </span>
              <CommandShortcut className="tracking-normal">Trang tìm kiếm</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        ) : null}

        {results && results.tasks.length > 0 ? (
          <CommandGroup heading="Công việc">
            {results.tasks.map((task) => (
              <CommandItem
                key={task.id}
                value={`remote:task:${task.id}`}
                onSelect={() => go(taskHref(task))}
              >
                <span className="w-16 shrink-0 font-mono text-xs text-foreground-muted">
                  {task.key}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <Highlight text={task.title} query={highlightTerm} />
                </span>
                <StatusPill status={task.status} size="xs" className="max-w-28" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results && results.messages.length > 0 ? (
          <CommandGroup heading="Tin nhắn">
            {results.messages.map((message) => (
              <CommandItem
                key={message.messageId}
                value={`remote:message:${message.messageId}`}
                onSelect={() => go(messageHref(message))}
                className="items-start"
              >
                {message.author ? (
                  <UserAvatar user={message.author} size="xs" className="mt-0.5" />
                ) : (
                  <Hash className="mt-0.5" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs text-foreground-muted">
                    {message.author?.displayName ?? "Hệ thống"} ·{" "}
                    {message.channelKind === "dm" || message.channelKind === "group_dm"
                      ? "Tin nhắn trực tiếp"
                      : `#${message.channelName ?? "kênh"}`}
                  </span>
                  <span className="line-clamp-2 text-[13px]">
                    <Highlight
                      text={excerptAround(message.text, highlightTerm, 60)}
                      query={highlightTerm}
                    />
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results && results.lists.length > 0 ? (
          <CommandGroup heading="Danh sách (tìm kiếm)">
            {results.lists.map((list) => (
              <CommandItem
                key={list.id}
                value={`remote:list:${list.id}`}
                onSelect={() => go(`/p/${list.projectId}/l/${list.id}`)}
              >
                <ColorDot color="gray" variant="ring" className="mx-1" />
                <span className="truncate">
                  <Highlight text={list.name} query={highlightTerm} />
                </span>
                <CommandShortcut className="truncate tracking-normal text-foreground-muted">
                  {list.projectName}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results && results.people.length > 0 ? (
          <CommandGroup heading="Mọi người">
            {results.people.map((person) => (
              <CommandItem
                key={person.id}
                value={`remote:person:${person.id}`}
                disabled={person.id === session.user.id}
                onSelect={() => run(() => openDm.mutate([person.id]))}
              >
                <UserAvatar user={person} size="xs" />
                <span className="truncate">
                  <Highlight text={person.displayName} query={highlightTerm} />
                </span>
                <CommandShortcut className="truncate tracking-normal text-foreground-muted">
                  {person.id === session.user.id ? "Bạn" : "Nhắn tin"}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {conversations.length > 0 ? (
          <CommandGroup heading="Kênh và tin nhắn">
            {(trimmed ? conversations : conversations.slice(0, 5)).map((channel) => {
              const title = channelTitle(channel);
              return (
                <CommandItem
                  key={channel.id}
                  value={`channel ${title}`}
                  keywords={channel.participants.map((user) => user.email ?? "")}
                  onSelect={() => go(`/c/${channel.id}`)}
                >
                  <span className="flex w-4 justify-center">
                    <ChannelGlyph channel={channel} />
                  </span>
                  <span className="truncate">{title}</span>
                  {channel.unreadCount > 0 ? (
                    <CommandShortcut className="tracking-normal">
                      {channel.unreadCount} chưa đọc
                    </CommandShortcut>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        <CommandGroup heading="Dự án">
          {projectItems.map((project) => {
            const first = project.lists[0];
            return (
              <CommandItem
                key={project.id}
                value={`project ${project.name}`}
                keywords={[project.key]}
                onSelect={() =>
                  go(first ? `/p/${project.id}/l/${first.id}` : `/p/${project.id}/settings`)
                }
              >
                <ProjectIcon
                  color={project.color}
                  icon={project.icon}
                  name={project.name}
                  size="xs"
                />
                <span className="truncate">{project.name}</span>
                <CommandShortcut className="font-mono tracking-normal text-foreground-subtle">
                  {project.key}
                </CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {trimmed ? (
          <CommandGroup heading="Danh sách">
            {projectItems.flatMap((project) =>
              project.lists.map((list) => (
                <CommandItem
                  key={list.id}
                  value={`list ${project.name} ${list.name}`}
                  onSelect={() => go(`/p/${project.id}/l/${list.id}`)}
                >
                  <ColorDot
                    color={list.color ?? "gray"}
                    variant={list.color ? "solid" : "ring"}
                    className="mx-1"
                  />
                  <span className="truncate">{list.name}</span>
                  <CommandShortcut className="truncate tracking-normal text-foreground-muted">
                    {project.name}
                  </CommandShortcut>
                </CommandItem>
              ))
            )}
          </CommandGroup>
        ) : null}

        <CommandSeparator />
        <CommandGroup heading="Điều hướng">
          <CommandItem value="nav trang chủ home" onSelect={() => go("/")}>
            <House /> Trang chủ
          </CommandItem>
          <CommandItem value="nav việc của tôi my tasks" onSelect={() => go("/my-tasks")}>
            <ListTodo /> Việc của tôi
          </CommandItem>
          <CommandItem value="nav hộp thư inbox thông báo" onSelect={() => go("/inbox")}>
            <Inbox /> Hộp thư
          </CommandItem>
          <CommandItem value="nav tìm kiếm search" onSelect={() => go("/search")}>
            <Search /> Trang tìm kiếm
          </CommandItem>
          <CommandItem value="nav hồ sơ profile mật khẩu" onSelect={() => go("/settings/profile")}>
            <UserRound /> Hồ sơ của tôi
          </CommandItem>
          {can(P.MemberView) ? (
            <CommandItem value="nav thành viên members" onSelect={() => go("/settings/members")}>
              <Users /> Thành viên tổ chức
            </CommandItem>
          ) : null}
          {can(P.RoleView) ? (
            <CommandItem value="nav vai trò quyền roles" onSelect={() => go("/settings/roles")}>
              <ShieldCheck /> Vai trò và quyền
            </CommandItem>
          ) : null}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Lệnh">
          <CommandItem
            value="action tin nhắn mới new message dm"
            onSelect={() => run(() => openChatDialog("new-message"))}
          >
            <MessageSquarePlus /> Tin nhắn mới
          </CommandItem>
          {can(P.ChannelCreate) ? (
            <CommandItem
              value="action tạo kênh mới new channel"
              onSelect={() => run(() => openChatDialog("create-channel"))}
            >
              <Hash /> Tạo kênh
            </CommandItem>
          ) : null}
          <CommandItem
            value="action duyệt kênh browse channels"
            onSelect={() => run(() => openChatDialog("browse-channels"))}
          >
            <Compass /> Duyệt kênh
          </CommandItem>
          {can(P.ProjectCreate) ? (
            <CommandItem
              value="action tạo dự án mới new project"
              onSelect={() => run(() => setNewProjectOpen(true))}
            >
              <FolderPlus /> Tạo dự án mới
            </CommandItem>
          ) : null}
          <CommandItem
            value="action giao diện sáng light theme"
            onSelect={() => run(() => setMode("light"))}
          >
            <Sun /> Giao diện sáng
          </CommandItem>
          <CommandItem
            value="action giao diện tối dark theme"
            onSelect={() => run(() => setMode("dark"))}
          >
            <Moon /> Giao diện tối
          </CommandItem>
          <CommandItem
            value="action giao diện theo hệ thống system theme"
            onSelect={() => run(() => setMode("system"))}
          >
            <Monitor /> Giao diện theo hệ thống
          </CommandItem>
          <CommandItem value="action cài đặt settings" onSelect={() => go("/settings")}>
            <Settings /> Mở cài đặt
          </CommandItem>
          <CommandItem value="action đăng xuất logout sign out" onSelect={() => run(logout)}>
            <LogOut /> Đăng xuất
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
