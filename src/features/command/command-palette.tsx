import {
  BookOpenText,
  BookPlus,
  Compass,
  FolderPlus,
  Hash,
  House,
  Inbox,
  Library,
  ListTodo,
  LogOut,
  MessageSquarePlus,
  Monitor,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  Users
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { P } from "@/features/auth/permissions";
import { useLogout, usePermissions, useSessionContext } from "@/features/auth/hooks";
import { ChannelGlyph } from "@/features/chat/components/channel-glyph";
import { useChannels, useOpenDm } from "@/features/chat/hooks/use-channels";
import { channelTitle, sortChannels } from "@/features/chat/model/channels";
import { useChatDialogStore } from "@/features/chat/model/ui-state";
import { departmentLabels } from "@/contracts/departments";
import { useDepartment } from "@/features/departments/hooks";
import { departmentIcons } from "@/features/departments/meta";
import { myTasksPathFor, withoutRetouchMyTasks } from "@/features/departments/model";
import { ImportanceBadge, KnowledgeStatusChip } from "@/features/knowledge/components/badges";
import { useKnowledgePermissions, useKnowledgeSpaces } from "@/features/knowledge/hooks";
import { canCreateSpace, canSeeKnowledge } from "@/features/knowledge/model/access";
import { useProductionNavEntries } from "@/features/production/hooks";
import { useProjects } from "@/features/projects/hooks";
import { Highlight } from "@/features/search/components/highlight";
import { excerptAround, foldText, knowledgeItemHref, messageHref } from "@/features/search/model";
import { tasksApi } from "@/features/tasks/api";
import { taskHref } from "@/features/tasks/use-task-panel";
import { isModKey } from "@/lib/keyboard";
import { qk } from "@/lib/query-keys";
import { useThemeStore } from "@/stores/theme-store";
import { useUiStore } from "@/stores/ui-store";

import { useGlobalSearch } from "./search-api";
import { ShellServices } from "./shell-services";
import { asTaskKey, findTaskByKey } from "./task-key";

/**
 * Global ⌘K / Ctrl+K palette: jump to conversations, navigation, actions and server-side search
 * (tasks, messages, projects, lists, people). Follows the current department (PD-041): projects, lists, tasks and
 * "Tạo dự án" only in Production, the Photo Retouch menu only in Photo Retouch; shared content everywhere. Also hosts the app-wide shell services (chat runtime,
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
        className="top-[12vh] sm:max-w-xl max-sm:flex max-sm:flex-col max-sm:rounded-none!"
        mobileLayout="fullscreen"
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
  const setNewSpaceOpen = useUiStore((state) => state.setNewSpaceOpen);
  const knowledgePermissions = useKnowledgePermissions();
  const knowledgeVisible = canSeeKnowledge(knowledgePermissions);
  const knowledgeSpaces = useKnowledgeSpaces(knowledgeVisible);
  const openChatDialog = useChatDialogStore((state) => state.open);
  const setMode = useThemeStore((state) => state.setMode);
  const openDm = useOpenDm();
  const { logout } = useLogout();
  const search = useGlobalSearch(term);
  const queryClient = useQueryClient();
  const { current: department, departments, canSwitch, setDepartment } = useDepartment();
  const workspace = department === "PRODUCTION";
  const productionNav = useProductionNavEntries();
  const retouchNav = department === "PHOTO_RETOUCH" ? withoutRetouchMyTasks(productionNav) : [];
  const myTasksPath = myTasksPathFor(
    department,
    productionNav.map((entry) => entry.to)
  );
  const trimmed = term.trim();
  const searching = trimmed.length >= 2;
  // An exact task key ("WEB-12") + Enter opens that task (WK-50), even before results arrive.
  const taskKey = workspace ? asTaskKey(trimmed) : null;
  const exactTask = findTaskByKey(search.data?.tasks, taskKey);
  const [opening, setOpening] = useState(false);

  const go = (path: string) => {
    onDone();
    void navigate(path);
  };
  const run = (action: () => void) => {
    onDone();
    action();
  };
  const openTaskByKey = async (key: string) => {
    if (exactTask) {
      go(taskHref(exactTask));
      return;
    }
    setOpening(true);
    try {
      const found = await tasksApi.byKey(key);
      const detail = await queryClient.fetchQuery({
        queryKey: qk.task(found.id),
        queryFn: ({ signal }) => tasksApi.get(found.id, signal)
      });
      go(taskHref(detail));
    } catch {
      // Unknown key or no access: fall back to the full search.
      go(`/search?q=${encodeURIComponent(key)}`);
    } finally {
      setOpening(false);
    }
  };

  const projectItems = workspace ? (projects.data?.items ?? []) : [];
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
      // Phones: full-screen search; the list takes the remaining height.
      className="max-sm:min-h-0 max-sm:flex-1 max-sm:rounded-none!"
    >
      <div className="flex items-center gap-1 sm:block">
        <div className="min-w-0 flex-1">
          <CommandInput
            autoFocus
            value={term}
            onValueChange={setTerm}
            placeholder="Tìm kiếm hoặc nhập lệnh…"
          />
        </div>
        <Button variant="ghost" className="mt-1 shrink-0 px-2 sm:hidden" onClick={onDone}>
          Hủy
        </Button>
      </div>
      <CommandList className="max-h-[min(60vh,28rem)] max-sm:max-h-none max-sm:flex-1 max-sm:pb-(--safe-bottom)">
        <CommandEmpty>
          {searching && (search.isFetching || search.isDebouncing) ? (
            <span className="inline-flex items-center gap-2 text-foreground-muted">
              <Spinner className="size-3.5" /> Đang tìm…
            </span>
          ) : (
            "Không có kết quả phù hợp."
          )}
        </CommandEmpty>

        {taskKey ? (
          <CommandGroup heading="Mở công việc">
            <CommandItem
              value={`remote:open-key:${taskKey}`}
              onSelect={() => void openTaskByKey(taskKey)}
            >
              <span className="w-16 shrink-0 font-mono text-xs text-foreground-muted">
                {exactTask?.key ?? taskKey}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {exactTask ? exactTask.title : "Mở công việc theo mã"}
              </span>
              {opening ? (
                <Spinner className="size-3.5" />
              ) : exactTask ? (
                <StatusPill status={exactTask.status} size="xs" className="max-w-28 max-sm:hidden" />
              ) : (
                <CommandShortcut className="tracking-normal">Enter</CommandShortcut>
              )}
            </CommandItem>
          </CommandGroup>
        ) : null}

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

        {workspace && results && results.tasks.some((task) => task.id !== exactTask?.id) ? (
          <CommandGroup heading="Công việc">
            {results.tasks.filter((task) => task.id !== exactTask?.id).map((task) => (
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
                <StatusPill status={task.status} size="xs" className="max-w-28 max-sm:hidden" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results && knowledgeVisible && (results.knowledge ?? []).length > 0 ? (
          <CommandGroup heading="Tri thức">
            {(results.knowledge ?? []).map((hit) => (
              <CommandItem
                key={hit.id}
                value={`remote:knowledge:${hit.id}`}
                onSelect={() => go(knowledgeItemHref(hit))}
                className="items-start"
              >
                <BookOpenText className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    <Highlight text={hit.title} query={highlightTerm} />
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-foreground-muted">
                    <span className="truncate">{hit.spaceName}</span>
                    <ImportanceBadge importance={hit.importance} size="xs" />
                    {/* Phones hide the status column: a retired item must still say so. */}
                    {hit.status.group === "retired" ? (
                      <KnowledgeStatusChip status={hit.status} size="xs" className="max-w-28 sm:hidden" />
                    ) : null}
                  </span>
                </span>
                <KnowledgeStatusChip status={hit.status} size="xs" className="max-w-28 max-sm:hidden" />
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

        {workspace && results && results.lists.length > 0 ? (
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

        {projectItems.length > 0 ? (
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
        ) : null}

        {retouchNav.length > 0 ? (
          <CommandGroup heading="Photo Retouch">
            {retouchNav.map((entry) => (
              <CommandItem
                key={entry.to}
                value={`nav photo retouch ${entry.label}`}
                onSelect={() => go(entry.to)}
              >
                <entry.icon /> {entry.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {knowledgeVisible && (knowledgeSpaces.data?.items ?? []).some((space) => space.archivedAt === null) ? (
          <CommandGroup heading="Kho tri thức">
            {(knowledgeSpaces.data?.items ?? [])
              .filter((space) => space.archivedAt === null)
              .map((space) => (
                <CommandItem
                  key={space.id}
                  value={`knowledge space kho tri thức ${space.name}`}
                  onSelect={() => go(`/k/${space.id}`)}
                >
                  <ProjectIcon color={space.color} icon={space.icon} name={space.name} size="xs" />
                  <span className="truncate">{space.name}</span>
                  <CommandShortcut className="tracking-normal text-foreground-subtle">
                    {space.visibility === "private" ? "Riêng tư" : "Công khai"}
                  </CommandShortcut>
                </CommandItem>
              ))}
          </CommandGroup>
        ) : null}

        {trimmed && projectItems.length > 0 ? (
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
          {myTasksPath ? (
            <CommandItem value="nav việc của tôi my tasks" onSelect={() => go(myTasksPath)}>
              <ListTodo /> Việc của tôi
            </CommandItem>
          ) : null}
          <CommandItem value="nav hộp thư inbox thông báo" onSelect={() => go("/inbox")}>
            <Inbox /> Hộp thư
          </CommandItem>
          {knowledgeVisible ? (
            <CommandItem value="nav tri thức kho tri thức knowledge wiki quy trình chính sách" onSelect={() => go("/k")}>
              <Library /> Tri thức
            </CommandItem>
          ) : null}
          <CommandItem value="nav tìm kiếm search" onSelect={() => go("/search")}>
            <Search /> Trang tìm kiếm
          </CommandItem>
          <CommandItem value="nav thùng rác trash đã xóa khôi phục" onSelect={() => go("/trash")}>
            <Trash2 /> Thùng rác
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
            <CommandItem
              value="nav vai trò phân quyền roles permissions job"
              onSelect={() => go("/settings/roles")}
            >
              <ShieldCheck /> Vai trò & phân quyền
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
          {workspace && can(P.ProjectCreate) ? (
            <CommandItem
              value="action tạo dự án mới new project"
              onSelect={() => run(() => setNewProjectOpen(true))}
            >
              <FolderPlus /> Tạo dự án mới
            </CommandItem>
          ) : null}
          {canCreateSpace(knowledgePermissions) ? (
            <CommandItem
              value="action tạo kho tri thức mới new knowledge space"
              onSelect={() => run(() => setNewSpaceOpen(true))}
            >
              <BookPlus /> Tạo kho tri thức
            </CommandItem>
          ) : null}
          {canSwitch
            ? departments
                .filter((entry) => entry !== department)
                .map((entry) => {
                  const Icon = departmentIcons[entry];
                  return (
                    <CommandItem
                      key={entry}
                      value={`action chuyển phòng ban department ${departmentLabels[entry]}`}
                      onSelect={() => run(() => setDepartment(entry))}
                    >
                      <Icon /> Chuyển sang {departmentLabels[entry]}
                    </CommandItem>
                  );
                })
            : null}
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
