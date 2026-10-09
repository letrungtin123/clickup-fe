import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  Files,
  FolderKanban,
  Inbox,
  LayoutList,
  LogOut,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Palette,
  PanelRightOpen,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SunMedium,
  Users,
  X
} from "lucide-react";
import { motion } from "motion/react";

import {
  Permission,
  type AuthUser,
  type PermissionKey,
  type ProjectMember,
  type ProjectSummary,
  type TaskActivityEvent,
  type TaskStatusSummary,
  type TaskSummary,
  type UpdateTaskRequest
} from "../contracts";
import { apiClient } from "../lib/api-client.js";
import { gradientAccentOptions, solidAccentOptions, type AccentMode, type AccentPalette } from "../lib/theme-palettes.js";
import { useThemeStore, type ThemeMode } from "../stores/theme-store.js";

const AdminPanel = lazy(() =>
  import("../components/workspace/AdminPanel.js").then((module) => ({ default: module.AdminPanel }))
);

type WorkspaceRouteProps = {
  user: AuthUser;
  onLogout: () => void;
  isLoggingOut: boolean;
};

type WorkspaceView = "projects" | "admin";
type DialogMode = "project" | "list" | "task" | null;

type ProjectFormState = {
  key: string;
  name: string;
  description: string;
};

type ListFormState = {
  name: string;
  description: string;
};

type TaskFormState = {
  listId: string;
  title: string;
  descriptionText: string;
  priority: TaskSummary["priority"];
  dueDate: string;
  assigneeIds: string[];
};

const priorityLabels: Record<TaskSummary["priority"], string> = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp"
};

const statusLabelsByKey: Record<string, string> = {
  TODO: "Cần làm",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn tất"
};

const activityLabels: Record<string, string> = {
  TASK_CREATED: "Đã tạo công việc",
  TASK_UPDATED: "Đã cập nhật công việc",
  COMMENT_CREATED: "Đã bình luận"
};

const roleLabelsByKey: Record<string, string> = {
  superadmin: "Siêu quản trị",
  admin: "Quản trị viên",
  manager: "Quản lý",
  member: "Thành viên"
};

const emptyProjectForm: ProjectFormState = {
  key: "",
  name: "",
  description: ""
};

const emptyListForm: ListFormState = {
  name: "",
  description: ""
};

const emptyTaskForm: TaskFormState = {
  listId: "",
  title: "",
  descriptionText: "",
  priority: "normal",
  dueDate: "",
  assigneeIds: []
};

const getPriorityTone = (priority: TaskSummary["priority"]) => {
  if (priority === "urgent") {
    return "danger";
  }

  if (priority === "high") {
    return "warning";
  }

  return "neutral";
};

const formatTaskCode = (project: ProjectSummary | null, task: TaskSummary) => {
  const prefix = project?.key ?? "CV";
  return `${prefix}-${task.id.slice(0, 6).toUpperCase()}`;
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "Chưa có hạn";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
};

const formatDateTime = (value: string) => {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

const toDateInputValue = (value: string | null) => {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
};

const toEndOfDayIso = (value: string) => {
  return new Date(`${value}T23:59:00`).toISOString();
};

const normalizeProjectKey = (value: string) => {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
};

const isDueToday = (value: string | null) => {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

const formatStatusName = (status: Pick<TaskStatusSummary, "key" | "name">) =>
  statusLabelsByKey[status.key] ?? status.name;

const formatListName = (name: string | null | undefined) => {
  if (!name) {
    return "-";
  }

  return name === "Inbox" ? "Hộp việc" : name;
};

const formatRoleName = (role: { key: string; name: string } | null | undefined) => {
  if (!role) {
    return "-";
  }

  return roleLabelsByKey[role.key] ?? role.name;
};

const formatActivityAction = (entry: TaskActivityEvent) =>
  activityLabels[entry.action] ?? "Hoạt động hệ thống";

const formatMemberName = (member: ProjectMember) =>
  member.user.email ? `${member.user.displayName} (${member.user.email})` : member.user.displayName;

const formatAssigneeSummary = (assigneeIds: string[], members: ProjectMember[]) => {
  if (assigneeIds.length === 0) {
    return "Chưa giao";
  }

  const names = members
    .filter((member) => assigneeIds.includes(member.user.id))
    .map((member) => member.user.displayName);

  if (names.length === 0) {
    return `${assigneeIds.length} người`;
  }

  if (names.length <= 2) {
    return names.join(", ");
  }

  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
};

export const WorkspaceRoute = ({ user, onLogout, isLoggingOut }: WorkspaceRouteProps) => {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<WorkspaceView>("projects");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [listForm, setListForm] = useState<ListFormState>(emptyListForm);
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm);
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({});
  const [commentText, setCommentText] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const metaQuery = useQuery({
    queryKey: ["product-meta"],
    queryFn: ({ signal }) => apiClient.getMeta(signal),
    retry: false
  });
  const contextQuery = useQuery({
    queryKey: ["workspace", "context"],
    queryFn: ({ signal }) => apiClient.getWorkspaceContext(signal),
    retry: false
  });
  const projectsQuery = useQuery({
    queryKey: ["workspace", "projects"],
    queryFn: ({ signal }) => apiClient.listProjects(signal),
    retry: false
  });

  const projects = useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data?.items]);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;
  const resolvedProjectId = activeProject?.id ?? null;
  const rolePermissions = contextQuery.data?.role.permissions ?? [];
  const hasFullOrganizationAuthority = contextQuery.data?.hasFullOrganizationAuthority ?? false;
  const hasPermission = (permission: PermissionKey) =>
    hasFullOrganizationAuthority || rolePermissions.includes(permission);
  const canCreateProjects = hasPermission(Permission.ProjectCreate);
  const canCreateLists = hasPermission(Permission.ListCreate);
  const canCreateTasks = hasPermission(Permission.TaskCreate);
  const canUpdateTasks = hasPermission(Permission.TaskUpdate);
  const canAssignTasks = hasPermission(Permission.TaskAssign);
  const canUseAdmin = hasPermission(Permission.RoleView) || hasPermission(Permission.ProjectManageMembers);

  const listsQuery = useQuery({
    queryKey: ["workspace", "projects", resolvedProjectId, "lists"],
    enabled: Boolean(resolvedProjectId && activeView === "projects"),
    queryFn: ({ signal }) => {
      if (!resolvedProjectId) {
        throw new Error("Thiếu mã dự án");
      }

      return apiClient.listProjectLists(resolvedProjectId, signal);
    },
    retry: false
  });
  const tasksQuery = useQuery({
    queryKey: ["workspace", "projects", resolvedProjectId, "tasks"],
    enabled: Boolean(resolvedProjectId && activeView === "projects"),
    queryFn: ({ signal }) => {
      if (!resolvedProjectId) {
        throw new Error("Thiếu mã dự án");
      }

      return apiClient.listProjectTasks(resolvedProjectId, { limit: 50, signal });
    },
    retry: false
  });

  const lists = listsQuery.data?.items ?? [];
  const tasks = tasksQuery.data?.items ?? [];
  const resolvedSelectedTaskId = selectedTaskId ?? tasks[0]?.id ?? null;

  const taskDetailQuery = useQuery({
    queryKey: ["workspace", "projects", resolvedProjectId, "tasks", resolvedSelectedTaskId, "detail"],
    enabled: Boolean(resolvedProjectId && resolvedSelectedTaskId && activeView === "projects"),
    queryFn: ({ signal }) => {
      if (!resolvedProjectId || !resolvedSelectedTaskId) {
        throw new Error("Thiếu thông tin công việc");
      }

      return apiClient.getTaskDetail(resolvedProjectId, resolvedSelectedTaskId, signal);
    },
    retry: false
  });

  const selectedTask =
    taskDetailQuery.data?.task ?? tasks.find((task) => task.id === resolvedSelectedTaskId) ?? null;
  const selectedTaskList = selectedTask ? lists.find((list) => list.id === selectedTask.listId) : null;

  const statusesQuery = useQuery({
    queryKey: ["workspace", "projects", resolvedProjectId, "statuses", selectedTask?.listId ?? null],
    enabled: Boolean(resolvedProjectId && activeView === "projects"),
    queryFn: ({ signal }) => {
      if (!resolvedProjectId) {
        throw new Error("Thiếu mã dự án");
      }

      return apiClient.listProjectStatuses(resolvedProjectId, {
        ...(selectedTask?.listId ? { listId: selectedTask.listId } : {}),
        signal
      });
    },
    retry: false
  });

  const projectMembersQuery = useQuery({
    queryKey: ["workspace", "projects", resolvedProjectId, "members"],
    enabled: Boolean(resolvedProjectId && activeView === "projects"),
    queryFn: ({ signal }) => {
      if (!resolvedProjectId) {
        throw new Error("Thiếu mã dự án");
      }

      return apiClient.listProjectMembers(resolvedProjectId, signal);
    },
    retry: false
  });

  const statuses = statusesQuery.data?.items ?? [];
  const projectMembers = projectMembersQuery.data?.items ?? [];
  const subtasks = taskDetailQuery.data?.subtasks ?? [];
  const hasWorkspaceError =
    contextQuery.isError || projectsQuery.isError || listsQuery.isError || tasksQuery.isError;
  const apiReady = metaQuery.isSuccess && contextQuery.isSuccess && projectsQuery.isSuccess;
  const openPriorityCount = tasks.filter(
    (task) => !task.status.isDone && (task.priority === "high" || task.priority === "urgent")
  ).length;
  const dueTodayCount = tasks.filter((task) => !task.status.isDone && isDueToday(task.dueAt)).length;

  const invalidateProjectData = async (projectId: string | null) => {
    await queryClient.invalidateQueries({ queryKey: ["workspace", "projects"] });
    if (projectId) {
      await queryClient.invalidateQueries({ queryKey: ["workspace", "projects", projectId] });
    }
  };

  const createProjectMutation = useMutation({
    mutationFn: apiClient.createProject,
    onSuccess: async (project) => {
      setActiveProjectId(project.id);
      setSelectedTaskId(null);
      setActiveView("projects");
      setDialogMode(null);
      setProjectForm(emptyProjectForm);
      setFormError(null);
      await invalidateProjectData(project.id);
    },
    onError: () => setFormError("Không tạo được dự án.")
  });

  const createListMutation = useMutation({
    mutationFn: (input: { projectId: string; name: string; description?: string }) =>
      apiClient.createProjectList(input.projectId, {
        name: input.name,
        ...(input.description ? { description: input.description } : {})
      }),
    onSuccess: async () => {
      setDialogMode(null);
      setListForm(emptyListForm);
      setFormError(null);
      await invalidateProjectData(resolvedProjectId);
    },
    onError: () => setFormError("Không tạo được danh sách.")
  });

  const createTaskMutation = useMutation({
    mutationFn: (input: {
      projectId: string;
      listId: string;
      title: string;
      descriptionText?: string;
      priority: TaskSummary["priority"];
      dueAt?: string;
      parentTaskId?: string;
      assigneeIds: string[];
    }) =>
      apiClient.createTask(input.projectId, {
        listId: input.listId,
        title: input.title,
        priority: input.priority,
        assigneeIds: input.assigneeIds,
        ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
        ...(input.descriptionText ? { descriptionText: input.descriptionText } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {})
      }),
    onSuccess: async (task, variables) => {
      setFormError(null);
      if (variables.parentTaskId) {
        setSubtaskTitle("");
        await queryClient.invalidateQueries({
          queryKey: ["workspace", "projects", variables.projectId, "tasks", variables.parentTaskId, "detail"]
        });
      } else {
        setSelectedTaskId(task.id);
        setDialogMode(null);
        setTaskForm(emptyTaskForm);
      }

      await invalidateProjectData(variables.projectId);
    },
    onError: () => setFormError("Không tạo được công việc.")
  });

  const updateTaskMutation = useMutation({
    mutationFn: (input: { taskId: string; patch: UpdateTaskRequest }) => {
      if (!resolvedProjectId) {
        throw new Error("Thiếu mã dự án");
      }

      return apiClient.updateTask(resolvedProjectId, input.taskId, input.patch);
    },
    onSuccess: async (detail) => {
      queryClient.setQueryData(
        ["workspace", "projects", resolvedProjectId, "tasks", detail.task.id, "detail"],
        detail
      );
      await invalidateProjectData(resolvedProjectId);
    }
  });

  const createCommentMutation = useMutation({
    mutationFn: (input: { taskId: string; bodyText: string }) => {
      if (!resolvedProjectId) {
        throw new Error("Thiếu mã dự án");
      }

      return apiClient.createTaskComment(resolvedProjectId, input.taskId, { bodyText: input.bodyText });
    },
    onSuccess: async (detail) => {
      setCommentText("");
      queryClient.setQueryData(
        ["workspace", "projects", resolvedProjectId, "tasks", detail.task.id, "detail"],
        detail
      );
      await invalidateProjectData(resolvedProjectId);
    }
  });

  const openDialog = (mode: Exclude<DialogMode, null>) => {
    setFormError(null);
    if (mode === "task") {
      setTaskForm({ ...emptyTaskForm, listId: lists[0]?.id ?? "" });
    }
    setDialogMode(mode);
  };

  const handleCreateProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = normalizeProjectKey(projectForm.key);
    if (key.length < 2 || !projectForm.name.trim()) {
      setFormError("Cần nhập mã và tên dự án.");
      return;
    }

    createProjectMutation.mutate({
      key,
      name: projectForm.name.trim(),
      ...(projectForm.description.trim() ? { description: projectForm.description.trim() } : {})
    });
  };

  const handleCreateList = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvedProjectId || !listForm.name.trim()) {
      setFormError("Cần nhập tên danh sách.");
      return;
    }

    createListMutation.mutate({
      projectId: resolvedProjectId,
      name: listForm.name.trim(),
      ...(listForm.description.trim() ? { description: listForm.description.trim() } : {})
    });
  };

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvedProjectId || !taskForm.listId || !taskForm.title.trim()) {
      setFormError("Cần nhập tiêu đề và danh sách cho công việc.");
      return;
    }

    createTaskMutation.mutate({
      projectId: resolvedProjectId,
      listId: taskForm.listId,
      title: taskForm.title.trim(),
      priority: taskForm.priority,
      assigneeIds: taskForm.assigneeIds,
      ...(taskForm.descriptionText.trim() ? { descriptionText: taskForm.descriptionText.trim() } : {}),
      ...(taskForm.dueDate ? { dueAt: toEndOfDayIso(taskForm.dueDate) } : {})
    });
  };

  const handleCreateSubtask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvedProjectId || !selectedTask || !subtaskTitle.trim()) {
      return;
    }

    createTaskMutation.mutate({
      projectId: resolvedProjectId,
      listId: selectedTask.listId,
      title: subtaskTitle.trim(),
      priority: "normal",
      parentTaskId: selectedTask.id,
      assigneeIds: selectedTask.assigneeIds
    });
  };

  const patchSelectedTask = (patch: UpdateTaskRequest) => {
    if (!selectedTask) {
      return;
    }

    updateTaskMutation.mutate({ taskId: selectedTask.id, patch });
  };

  const saveDescription = () => {
    if (!selectedTask) {
      return;
    }

    const draft = descriptionDrafts[selectedTask.id] ?? taskDetailQuery.data?.task.descriptionText ?? "";
    patchSelectedTask({ descriptionText: draft.trim() ? draft : null });
  };

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTask || !commentText.trim()) {
      return;
    }

    createCommentMutation.mutate({ taskId: selectedTask.id, bodyText: commentText.trim() });
  };

  const toggleTaskFormAssignee = (userId: string) => {
    setTaskForm((form) => ({
      ...form,
      assigneeIds: form.assigneeIds.includes(userId)
        ? form.assigneeIds.filter((assigneeId) => assigneeId !== userId)
        : [...form.assigneeIds, userId]
    }));
  };

  const toggleSelectedTaskAssignee = (userId: string) => {
    if (!selectedTask) {
      return;
    }

    const nextAssigneeIds = selectedTask.assigneeIds.includes(userId)
      ? selectedTask.assigneeIds.filter((assigneeId) => assigneeId !== userId)
      : [...selectedTask.assigneeIds, userId];
    patchSelectedTask({ assigneeIds: nextAssigneeIds });
  };

  const changeProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setSelectedTaskId(null);
    setActiveView("projects");
  };

  const pageTitle = activeView === "admin" ? "Quản trị hệ thống" : activeProject?.name ?? "Không gian làm việc";

  return (
    <main className="workspace-shell">
      <aside className="workspace-nav" aria-label="Điều hướng chính">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            N
          </div>
          <div>
            <p className="brand-name">Nesso Work</p>
            <p className="brand-subtitle">
              {contextQuery.data?.organization.name ?? user.email ?? "Đã đăng nhập"}
            </p>
          </div>
        </div>

        <nav className="nav-stack">
          <NavItem
            icon={<FolderKanban />}
            label="Dự án"
            active={activeView === "projects"}
            onClick={() => setActiveView("projects")}
          />
          <NavItem icon={<MessageSquare />} label="Kênh" disabled />
          <NavItem icon={<BookOpen />} label="Tri thức" disabled />
          <NavItem icon={<Inbox />} label="Hộp việc" disabled />
          <NavItem
            icon={<ShieldCheck />}
            label="Quản trị"
            active={activeView === "admin"}
            onClick={() => setActiveView("admin")}
          />
        </nav>

        <div className="nav-section">
          <div className="section-label">
            <span>Dự án</span>
            <button
              className="icon-button"
              aria-label="Tạo dự án"
              disabled={!canCreateProjects}
              onClick={() => openDialog("project")}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="project-list">
            {projectsQuery.isPending ? <StateRow label="Đang tải dự án" /> : null}
            {!projectsQuery.isPending && projects.length === 0 ? <StateRow label="Chưa có dự án" /> : null}
            {projects.map((project) => (
              <button
                className={project.id === resolvedProjectId ? "project-link active" : "project-link"}
                key={project.id}
                onClick={() => changeProject(project.id)}
                type="button"
              >
                <CircleDot size={14} />
                <span>{project.name}</span>
                <span className="project-count">{project.key}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="nav-footer">
          <button className="icon-button" aria-label="Tìm kiếm" type="button">
            <Search size={18} />
          </button>
          <button className="icon-button" aria-label="Cài đặt" type="button">
            <Settings size={18} />
          </button>
          <ThemeMenu />
          <button
            className="icon-button"
            aria-label="Đăng xuất"
            disabled={isLoggingOut}
            onClick={onLogout}
            type="button"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="workspace-main" aria-label="Không gian làm việc">
        <header className="workspace-header">
          <div>
            <div className="breadcrumb">
              <span>{activeView === "admin" ? "Tổ chức" : "Dự án"}</span>
              <ChevronDown size={14} />
              <span>{activeView === "admin" ? contextQuery.data?.organization.name ?? "Nesso Work" : pageTitle}</span>
            </div>
            <h1>{pageTitle}</h1>
          </div>
          <div className="header-actions">
            <button className="command-button" type="button">
              <Command size={16} />
              <span>Tìm kiếm</span>
            </button>
            {activeView === "projects" ? (
              <>
                <button
                  className="command-button"
                  disabled={!resolvedProjectId || !canCreateLists}
                  onClick={() => openDialog("list")}
                  type="button"
                >
                  <Plus size={16} />
                  <span>Danh sách</span>
                </button>
                <button
                  className="primary-button"
                  disabled={!resolvedProjectId || lists.length === 0 || !canCreateTasks}
                  onClick={() => openDialog("task")}
                  type="button"
                >
                  <Plus size={16} />
                  <span>Công việc</span>
                </button>
              </>
            ) : null}
          </div>
        </header>

        {activeView === "admin" ? (
          <Suspense fallback={<StateRow label="Đang tải quản trị" />}>
            <AdminPanel
              currentUserId={user.id}
              hasFullOrganizationAuthority={hasFullOrganizationAuthority}
              permissions={rolePermissions}
              project={activeProject}
            />
          </Suspense>
        ) : (
          <>
            <div className="view-tabs" role="tablist" aria-label="Chế độ xem công việc">
              <button className="view-tab active" role="tab" aria-selected="true" type="button">
                <LayoutList size={16} />
                Danh sách
              </button>
              <button className="view-tab" role="tab" aria-selected="false" type="button">
                <Files size={16} />
                Bảng
              </button>
            </div>

            <div className="work-grid">
              <div className="status-lane">
                <div className="lane-header">
                  <span>{activeProject ? "Công việc" : "Không gian làm việc"}</span>
                  <span>{tasks.length}</span>
                </div>
                <div className="task-stack">
                  {hasWorkspaceError ? <StateRow label="Không tải được không gian làm việc" /> : null}
                  {!hasWorkspaceError && (projectsQuery.isPending || tasksQuery.isPending) ? (
                    <StateRow label="Đang tải công việc" />
                  ) : null}
                  {!hasWorkspaceError && !projectsQuery.isPending && projects.length === 0 ? (
                    <StateRow label="Chưa có dự án" />
                  ) : null}
                  {!hasWorkspaceError && resolvedProjectId && lists.length === 0 && !listsQuery.isPending ? (
                    <StateRow label="Chưa có danh sách" />
                  ) : null}
                  {!hasWorkspaceError && resolvedProjectId && !tasksQuery.isPending && tasks.length === 0 ? (
                    <StateRow label="Chưa có công việc" />
                  ) : null}
                  {tasks.map((task, index) => {
                    const taskCode = formatTaskCode(activeProject, task);
                    return (
                      <motion.button
                        aria-label={`Mở ${taskCode}`}
                        className={task.id === resolvedSelectedTaskId ? "task-row selected" : "task-row"}
                        key={task.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => setSelectedTaskId(task.id)}
                        transition={{ delay: index * 0.04 }}
                        type="button"
                      >
                        <div className="task-check" aria-hidden="true">
                          <CheckCircle2 size={16} />
                        </div>
                        <div className="task-content">
                          <div className="task-title-row">
                            <span className="task-id">{taskCode}</span>
                            <span className={`priority ${getPriorityTone(task.priority)}`}>
                              {priorityLabels[task.priority]}
                            </span>
                          </div>
                          <h2>{task.title}</h2>
                          <div className="task-meta">
                            <span>{formatStatusName(task.status)}</span>
                            <span>{task.assigneeIds.length} người phụ trách</span>
                            {task.subtaskCount > 0 ? <span>{task.subtaskCount} việc con</span> : null}
                            <span>{formatDate(task.dueAt)}</span>
                          </div>
                        </div>
                        <span className="icon-button" aria-hidden="true">
                          <MoreHorizontal size={16} />
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <aside className="insight-panel" aria-label="Thông tin nhanh">
                <div className="insight-header">
                  <Bell size={18} />
                  <span>Hộp thông báo</span>
                </div>
                <div className="metric">
                  <span>Ưu tiên mở</span>
                  <strong>{openPriorityCount}</strong>
                </div>
                <div className="metric">
                  <span>Đến hạn hôm nay</span>
                  <strong>{dueTodayCount}</strong>
                </div>
                <div className="metric">
                  <span>Vai trò</span>
                  <strong>{formatRoleName(contextQuery.data?.role)}</strong>
                </div>
                <div className="api-status">
                  <span className={apiReady ? "status-dot ok" : hasWorkspaceError ? "status-dot error" : "status-dot"} />
                  <span>{apiReady ? "API đã kết nối" : hasWorkspaceError ? "API lỗi" : "Đang chờ API"}</span>
                </div>
              </aside>
            </div>
          </>
        )}
      </section>

      <aside className="detail-panel" aria-label={activeView === "admin" ? "Thông tin quản trị" : "Chi tiết công việc"}>
        <div className="detail-toolbar">
          <PanelRightOpen size={18} />
          <button className="icon-button" aria-label="Thao tác khác" type="button">
            <MoreHorizontal size={16} />
          </button>
        </div>
        {activeView === "admin" ? (
          <AdminDetail
            apiReady={apiReady}
            canUseAdmin={canUseAdmin}
            organizationName={contextQuery.data?.organization.name ?? "Nesso Work"}
            permissionCount={rolePermissions.length}
            projectName={activeProject?.name ?? "Chưa chọn dự án"}
            roleName={formatRoleName(contextQuery.data?.role)}
          />
        ) : selectedTask ? (
          <>
            <div className="detail-heading">
              <span className="task-id">{formatTaskCode(activeProject, selectedTask)}</span>
              <h2>{selectedTask.title}</h2>
            </div>
            <div className="detail-fields">
              <Field
                icon={<Users size={16} />}
                label="Người phụ trách"
                value={formatAssigneeSummary(selectedTask.assigneeIds, projectMembers)}
              />
              <label className="detail-field editable-field">
                <Clock3 size={16} />
                <span>Đến hạn</span>
                <input
                  className="field-input"
                  disabled={!canUpdateTasks || updateTaskMutation.isPending}
                  onChange={(event) =>
                    patchSelectedTask({ dueAt: event.target.value ? toEndOfDayIso(event.target.value) : null })
                  }
                  type="date"
                  value={toDateInputValue(selectedTask.dueAt)}
                />
              </label>
              <Field icon={<ShieldCheck size={16} />} label="Danh sách" value={formatListName(selectedTaskList?.name)} />
              <label className="detail-field editable-field">
                <CircleDot size={16} />
                <span>Trạng thái</span>
                <select
                  className="field-input"
                  disabled={!canUpdateTasks || statusesQuery.isPending || statuses.length === 0 || updateTaskMutation.isPending}
                  onChange={(event) => patchSelectedTask({ statusId: event.target.value })}
                  value={selectedTask.status.id}
                >
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {formatStatusName(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="detail-field editable-field">
                <CheckCircle2 size={16} />
                <span>Ưu tiên</span>
                <select
                  className="field-input"
                  disabled={!canUpdateTasks || updateTaskMutation.isPending}
                  onChange={(event) => patchSelectedTask({ priority: event.target.value as TaskSummary["priority"] })}
                  value={selectedTask.priority}
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="detail-editor">
              <p className="panel-label">Người phụ trách</p>
              <div className="assignee-picker" aria-label="Chọn người phụ trách">
                {projectMembersQuery.isPending ? <StateRow label="Đang tải thành viên dự án" /> : null}
                {!projectMembersQuery.isPending && projectMembers.length === 0 ? (
                  <StateRow label="Chưa có thành viên dự án" />
                ) : null}
                {projectMembers.map((member) => (
                  <label className="check-row" key={member.id}>
                    <input
                      checked={selectedTask.assigneeIds.includes(member.user.id)}
                      disabled={!canAssignTasks || updateTaskMutation.isPending}
                      onChange={() => toggleSelectedTaskAssignee(member.user.id)}
                      type="checkbox"
                    />
                    <span>{formatMemberName(member)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="detail-editor">
              <p className="panel-label">Mô tả</p>
              <textarea
                className="textarea-input"
                disabled={!canUpdateTasks}
                onChange={(event) =>
                  setDescriptionDrafts((drafts) => ({ ...drafts, [selectedTask.id]: event.target.value }))
                }
                placeholder="Thêm mô tả"
                value={descriptionDrafts[selectedTask.id] ?? taskDetailQuery.data?.task.descriptionText ?? ""}
              />
              <button
                className="command-button compact-button"
                disabled={!canUpdateTasks || updateTaskMutation.isPending}
                onClick={saveDescription}
                type="button"
              >
                <span>Lưu</span>
              </button>
            </div>

            <div className="timeline">
              <div className="panel-line">
                <p className="panel-label">Công việc con</p>
                <span className="muted-text">{selectedTask.subtaskCount} mục</span>
              </div>
              <form className="inline-form" onSubmit={handleCreateSubtask}>
                <input
                  className="text-input"
                  onChange={(event) => setSubtaskTitle(event.target.value)}
                  placeholder="Tên công việc con"
                  value={subtaskTitle}
                />
                <button
                  className="icon-button"
                  disabled={!canCreateTasks || !subtaskTitle.trim() || createTaskMutation.isPending}
                  type="submit"
                  aria-label="Tạo công việc con"
                >
                  <Plus size={16} />
                </button>
              </form>
              {taskDetailQuery.isPending ? <StateRow label="Đang tải công việc con" /> : null}
              {!taskDetailQuery.isPending && subtasks.length === 0 ? <StateRow label="Chưa có công việc con" /> : null}
              {subtasks.map((subtask) => (
                <button className="subtask-row" key={subtask.id} onClick={() => setSelectedTaskId(subtask.id)} type="button">
                  <span>
                    <strong>{subtask.title}</strong>
                    <small>
                      {formatStatusName(subtask.status)} · {formatDate(subtask.dueAt)}
                    </small>
                  </span>
                  <span className={`priority ${getPriorityTone(subtask.priority)}`}>
                    {priorityLabels[subtask.priority]}
                  </span>
                </button>
              ))}
            </div>

            <div className="timeline">
              <p className="panel-label">Bình luận</p>
              <form className="comment-form" onSubmit={submitComment}>
                <input
                  className="text-input"
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Nhập bình luận"
                  value={commentText}
                />
                <button
                  className="icon-button"
                  disabled={!commentText.trim() || createCommentMutation.isPending}
                  type="submit"
                  aria-label="Gửi bình luận"
                >
                  <Send size={16} />
                </button>
              </form>
              {taskDetailQuery.data?.comments.map((comment) => (
                <div className="comment-entry" key={comment.id}>
                  <span>{comment.bodyText}</span>
                  <small>{formatDateTime(comment.createdAt)}</small>
                </div>
              ))}
            </div>

            <div className="timeline">
              <p className="panel-label">Hoạt động</p>
              {taskDetailQuery.data?.activity.map((entry) => (
                <TimelineEntry key={entry.id} label={`${formatActivityAction(entry)} · ${formatDateTime(entry.createdAt)}`} />
              ))}
            </div>
          </>
        ) : (
          <div className="detail-empty">
            <span className="task-id">Chưa chọn công việc</span>
          </div>
        )}
      </aside>

      {dialogMode === "project" ? (
        <Dialog title="Dự án mới" onClose={() => setDialogMode(null)}>
          <form className="form-grid" onSubmit={handleCreateProject}>
            <label>
              <span>Mã dự án</span>
              <input
                className="text-input"
                onChange={(event) => setProjectForm((form) => ({ ...form, key: normalizeProjectKey(event.target.value) }))}
                placeholder="VH"
                value={projectForm.key}
              />
            </label>
            <label>
              <span>Tên dự án</span>
              <input
                className="text-input"
                onChange={(event) => setProjectForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="Vận hành"
                value={projectForm.name}
              />
            </label>
            <label>
              <span>Mô tả</span>
              <textarea
                className="textarea-input"
                onChange={(event) => setProjectForm((form) => ({ ...form, description: event.target.value }))}
                placeholder="Ghi chú dự án"
                value={projectForm.description}
              />
            </label>
            {formError ? <p className="auth-error">{formError}</p> : null}
            <div className="button-row">
              <button className="command-button" onClick={() => setDialogMode(null)} type="button">
                <span>Hủy</span>
              </button>
              <button className="primary-button" disabled={createProjectMutation.isPending} type="submit">
                <span>Tạo</span>
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialogMode === "list" ? (
        <Dialog title="Danh sách mới" onClose={() => setDialogMode(null)}>
          <form className="form-grid" onSubmit={handleCreateList}>
            <label>
              <span>Tên danh sách</span>
              <input
                className="text-input"
                onChange={(event) => setListForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="Việc sprint"
                value={listForm.name}
              />
            </label>
            <label>
              <span>Mô tả</span>
              <textarea
                className="textarea-input"
                onChange={(event) => setListForm((form) => ({ ...form, description: event.target.value }))}
                placeholder="Ghi chú danh sách"
                value={listForm.description}
              />
            </label>
            {formError ? <p className="auth-error">{formError}</p> : null}
            <div className="button-row">
              <button className="command-button" onClick={() => setDialogMode(null)} type="button">
                <span>Hủy</span>
              </button>
              <button className="primary-button" disabled={createListMutation.isPending} type="submit">
                <span>Tạo</span>
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialogMode === "task" ? (
        <Dialog title="Công việc mới" onClose={() => setDialogMode(null)}>
          <form className="form-grid" onSubmit={handleCreateTask}>
            <label>
              <span>Danh sách</span>
              <select
                className="text-input"
                onChange={(event) => setTaskForm((form) => ({ ...form, listId: event.target.value }))}
                value={taskForm.listId}
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {formatListName(list.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tiêu đề</span>
              <input
                className="text-input"
                onChange={(event) => setTaskForm((form) => ({ ...form, title: event.target.value }))}
                placeholder="Chuẩn bị checklist ra mắt"
                value={taskForm.title}
              />
            </label>
            <label>
              <span>Mức ưu tiên</span>
              <select
                className="text-input"
                onChange={(event) => setTaskForm((form) => ({ ...form, priority: event.target.value as TaskSummary["priority"] }))}
                value={taskForm.priority}
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Ngày đến hạn</span>
              <input
                className="text-input"
                onChange={(event) => setTaskForm((form) => ({ ...form, dueDate: event.target.value }))}
                type="date"
                value={taskForm.dueDate}
              />
            </label>
            <label>
              <span>Người phụ trách</span>
              <div className="assignee-picker">
                {projectMembers.length === 0 ? <StateRow label="Chưa có thành viên dự án" /> : null}
                {projectMembers.map((member) => (
                  <label className="check-row" key={member.id}>
                    <input
                      checked={taskForm.assigneeIds.includes(member.user.id)}
                      disabled={!canAssignTasks}
                      onChange={() => toggleTaskFormAssignee(member.user.id)}
                      type="checkbox"
                    />
                    <span>{formatMemberName(member)}</span>
                  </label>
                ))}
              </div>
            </label>
            <label>
              <span>Mô tả</span>
              <textarea
                className="textarea-input"
                onChange={(event) => setTaskForm((form) => ({ ...form, descriptionText: event.target.value }))}
                placeholder="Ghi chú công việc"
                value={taskForm.descriptionText}
              />
            </label>
            {formError ? <p className="auth-error">{formError}</p> : null}
            <div className="button-row">
              <button className="command-button" onClick={() => setDialogMode(null)} type="button">
                <span>Hủy</span>
              </button>
              <button className="primary-button" disabled={createTaskMutation.isPending || lists.length === 0} type="submit">
                <span>Tạo</span>
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </main>
  );
};

const AdminDetail = ({
  apiReady,
  canUseAdmin,
  organizationName,
  permissionCount,
  projectName,
  roleName
}: {
  apiReady: boolean;
  canUseAdmin: boolean;
  organizationName: string;
  permissionCount: number;
  projectName: string;
  roleName: string;
}) => (
  <>
    <div className="detail-heading">
      <span className="task-id">QUẢN TRỊ</span>
      <h2>Thông tin tổ chức</h2>
    </div>
    <div className="detail-fields">
      <Field icon={<ShieldCheck size={16} />} label="Tổ chức" value={organizationName} />
      <Field icon={<Users size={16} />} label="Vai trò" value={roleName} />
      <Field icon={<FolderKanban size={16} />} label="Dự án" value={projectName} />
      <Field icon={<CheckCircle2 size={16} />} label="Số quyền" value={`${permissionCount}`} />
    </div>
    <div className="api-status detail-status">
      <span className={apiReady ? "status-dot ok" : "status-dot"} />
      <span>{apiReady ? "API đã kết nối" : "Đang chờ API"}</span>
    </div>
    {!canUseAdmin ? (
      <p className="muted-text">Vai trò hiện tại chưa có quyền xem cấu hình quản trị.</p>
    ) : null}
  </>
);

const Dialog = ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => (
  <div className="modal-backdrop" role="presentation">
    <section className="dialog-panel" aria-label={title}>
      <div className="dialog-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Đóng hộp thoại" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>
      {children}
    </section>
  </div>
);

const StateRow = ({ label }: { label: string }) => <div className="state-row">{label}</div>;

const TimelineEntry = ({ label }: { label: string }) => (
  <div className="timeline-entry">
    <span className="timeline-dot" />
    <span>{label}</span>
  </div>
);

const NavItem = ({
  icon,
  label,
  active = false,
  disabled = false,
  onClick
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) => (
  <button className={active ? "nav-item active" : "nav-item"} disabled={disabled} onClick={onClick} type="button">
    {icon}
    <span>{label}</span>
  </button>
);

const accentModeLabels: Record<AccentMode, string> = {
  solid: "Đơn sắc",
  gradient: "Chuyển sắc"
};

const ThemeMenu = () => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const mode = useThemeStore((state) => state.mode);
  const accentMode = useThemeStore((state) => state.accentMode);
  const accentKey = useThemeStore((state) => state.accentKey);
  const setMode = useThemeStore((state) => state.setMode);
  const setAccentMode = useThemeStore((state) => state.setAccentMode);
  const setAccent = useThemeStore((state) => state.setAccent);
  const accentOptions: readonly AccentPalette[] = accentMode === "solid" ? solidAccentOptions : gradientAccentOptions;
  const modeOptions: Array<{ value: ThemeMode; label: string; icon: ReactNode }> = [
    { value: "light", label: "Sáng", icon: <SunMedium size={14} /> },
    { value: "dark", label: "Tối", icon: <Moon size={14} /> },
    { value: "system", label: "Hệ thống", icon: <Settings size={14} /> }
  ];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="theme-menu" ref={menuRef}>
      <button
        className={isOpen ? "icon-button theme-trigger active" : "icon-button theme-trigger"}
        aria-expanded={isOpen}
        aria-label="Mở cài đặt giao diện"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <Palette size={18} />
      </button>

      {isOpen ? (
        <div className="theme-popover" role="dialog" aria-label="Cài đặt giao diện">
          <div className="theme-menu-header">
            <span>Giao diện</span>
          </div>

          <div className="theme-mode-grid" aria-label="Chế độ màu">
            {modeOptions.map((option) => (
              <button
                className={mode === option.value ? "theme-option-button active" : "theme-option-button"}
                key={option.value}
                onClick={() => setMode(option.value)}
                type="button"
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <div className="theme-accent-switch" aria-label="Kiểu màu nhấn">
            {(["solid", "gradient"] as const).map((option) => (
              <button
                className={accentMode === option ? "theme-segment active" : "theme-segment"}
                key={option}
                onClick={() => setAccentMode(option)}
                type="button"
              >
                {accentModeLabels[option]}
              </button>
            ))}
          </div>

          <div className="theme-swatch-grid" aria-label="Màu nhấn">
            {accentOptions.map((option) => {
              const selected = accentKey === option.key;
              return (
                <button
                  className={selected ? "theme-swatch active" : "theme-swatch"}
                  key={option.key}
                  onClick={() => setAccent(option.key)}
                  type="button"
                >
                  <span className="theme-swatch-preview" style={{ background: option.swatch }} />
                  <span className="theme-swatch-label">{option.label}</span>
                  <span className="theme-swatch-check" aria-hidden="true">
                    {selected ? <Check size={13} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const Field = ({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <div className="detail-field">
    {icon}
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);
