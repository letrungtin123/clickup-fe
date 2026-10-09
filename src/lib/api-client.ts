import {
  ArchiveResponseSchema,
  AuthSessionSchema,
  CreateListRequestSchema,
  CreateProjectRequestSchema,
  CreateRoleRequestSchema,
  CreateTaskCommentRequestSchema,
  CreateTaskRequestSchema,
  ListCollectionSchema,
  ListSummarySchema,
  LoginRequestSchema,
  ManagedRoleSchema,
  OrganizationMemberCollectionSchema,
  OrganizationMemberSchema,
  PermissionCollectionSchema,
  LogoutResponseSchema,
  ProductMetaSchema,
  ProjectCollectionSchema,
  ProjectMemberSchema,
  ProjectMemberCollectionSchema,
  ProjectSummarySchema,
  RoleCollectionSchema,
  TaskDetailResponseSchema,
  TaskPageSchema,
  TaskStatusCollectionSchema,
  TaskSummarySchema,
  UpdateListRequestSchema,
  UpdateOrganizationMemberRequestSchema,
  UpdateProjectMemberRequestSchema,
  UpdateProjectRequestSchema,
  UpdateRolePermissionsRequestSchema,
  UpdateRoleRequestSchema,
  UpdateTaskRequestSchema,
  UpsertProjectMemberRequestSchema,
  WorkspaceContextSchema
} from "../contracts";
import type {
  ArchiveResponse,
  AuthSession,
  AuthUser,
  CreateListRequest,
  CreateProjectRequest,
  CreateRoleRequest,
  CreateTaskCommentRequest,
  CreateTaskRequest,
  ListCollection,
  ListSummary,
  LoginRequest,
  ManagedRole,
  OrganizationMember,
  OrganizationMemberCollection,
  PermissionCollection,
  ProductMeta,
  ProjectCollection,
  ProjectMember,
  ProjectMemberCollection,
  ProjectSummary,
  RoleCollection,
  TaskDetailResponse,
  TaskPage,
  TaskStatusCollection,
  TaskSummary,
  UpdateListRequest,
  UpdateOrganizationMemberRequest,
  UpdateProjectMemberRequest,
  UpdateProjectRequest,
  UpdateRolePermissionsRequest,
  UpdateRoleRequest,
  UpdateTaskRequest,
  UpsertProjectMemberRequest,
  WorkspaceContext
} from "../contracts";
import { webEnv } from "./env.js";

export class ApiClientError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
  }
}

type JsonRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

type TaskPageOptions = {
  listId?: string;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

type StatusListOptions = {
  listId?: string;
  signal?: AbortSignal;
};

const withSignal = (signal?: AbortSignal): JsonRequestOptions => {
  return signal ? { signal } : {};
};

const buildQueryString = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
};

const requestJson = async <T>(
  path: string,
  parse: (value: unknown) => T,
  options: JsonRequestOptions = {}
) => {
  const headers: HeadersInit = {
    accept: "application/json"
  };

  const init: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
    headers
  };

  if (options.signal) {
    init.signal = options.signal;
  }

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${webEnv.apiBaseUrl}${path}`, init);

  if (!response.ok) {
    throw new ApiClientError("API request failed", response.status);
  }

  return parse(await response.json());
};

export const apiClient = {
  getMeta: (signal?: AbortSignal): Promise<ProductMeta> =>
    requestJson<ProductMeta>("/meta", (value) => ProductMetaSchema.parse(value), withSignal(signal)),
  getCurrentUser: async (signal?: AbortSignal): Promise<AuthUser | null> => {
    try {
      const session = await requestJson<AuthSession>(
        "/auth/me",
        (value) => AuthSessionSchema.parse(value),
        withSignal(signal)
      );
      return session.user;
    } catch (error) {
      if (error instanceof ApiClientError && error.statusCode === 401) {
        return null;
      }

      throw error;
    }
  },
  getWorkspaceContext: (signal?: AbortSignal): Promise<WorkspaceContext> =>
    requestJson<WorkspaceContext>(
      "/workspace/context",
      (value) => WorkspaceContextSchema.parse(value),
      withSignal(signal)
    ),
  listPermissions: (signal?: AbortSignal): Promise<PermissionCollection> =>
    requestJson<PermissionCollection>("/permissions", (value) => PermissionCollectionSchema.parse(value), withSignal(signal)),
  listRoles: (signal?: AbortSignal): Promise<RoleCollection> =>
    requestJson<RoleCollection>("/roles", (value) => RoleCollectionSchema.parse(value), withSignal(signal)),
  createRole: (input: CreateRoleRequest): Promise<ManagedRole> =>
    requestJson<ManagedRole>("/roles", (value) => ManagedRoleSchema.parse(value), {
      method: "POST",
      body: CreateRoleRequestSchema.parse(input)
    }),
  updateRole: (roleId: string, input: UpdateRoleRequest): Promise<ManagedRole> =>
    requestJson<ManagedRole>(`/roles/${roleId}`, (value) => ManagedRoleSchema.parse(value), {
      method: "PATCH",
      body: UpdateRoleRequestSchema.parse(input)
    }),
  updateRolePermissions: (roleId: string, input: UpdateRolePermissionsRequest): Promise<ManagedRole> =>
    requestJson<ManagedRole>(`/roles/${roleId}/permissions`, (value) => ManagedRoleSchema.parse(value), {
      method: "PATCH",
      body: UpdateRolePermissionsRequestSchema.parse(input)
    }),
  archiveRole: (roleId: string): Promise<ArchiveResponse> =>
    requestJson<ArchiveResponse>(`/roles/${roleId}`, (value) => ArchiveResponseSchema.parse(value), {
      method: "DELETE"
    }),
  listOrganizationMembers: (signal?: AbortSignal): Promise<OrganizationMemberCollection> =>
    requestJson<OrganizationMemberCollection>(
      "/organization/members",
      (value) => OrganizationMemberCollectionSchema.parse(value),
      withSignal(signal)
    ),
  updateOrganizationMember: (membershipId: string, input: UpdateOrganizationMemberRequest): Promise<OrganizationMember> =>
    requestJson<OrganizationMember>(`/organization/members/${membershipId}`, (value) => OrganizationMemberSchema.parse(value), {
      method: "PATCH",
      body: UpdateOrganizationMemberRequestSchema.parse(input)
    }),
  listProjects: (signal?: AbortSignal): Promise<ProjectCollection> =>
    requestJson<ProjectCollection>("/projects", (value) => ProjectCollectionSchema.parse(value), withSignal(signal)),
  createProject: (input: CreateProjectRequest): Promise<ProjectSummary> =>
    requestJson<ProjectSummary>("/projects", (value) => ProjectSummarySchema.parse(value), {
      method: "POST",
      body: CreateProjectRequestSchema.parse(input)
    }),
  updateProject: (projectId: string, input: UpdateProjectRequest): Promise<ProjectSummary> =>
    requestJson<ProjectSummary>(`/projects/${projectId}`, (value) => ProjectSummarySchema.parse(value), {
      method: "PATCH",
      body: UpdateProjectRequestSchema.parse(input)
    }),
  archiveProject: (projectId: string): Promise<ArchiveResponse> =>
    requestJson<ArchiveResponse>(`/projects/${projectId}`, (value) => ArchiveResponseSchema.parse(value), {
      method: "DELETE"
    }),
  listProjectMembers: (projectId: string, signal?: AbortSignal): Promise<ProjectMemberCollection> =>
    requestJson<ProjectMemberCollection>(
      `/projects/${projectId}/members`,
      (value) => ProjectMemberCollectionSchema.parse(value),
      withSignal(signal)
    ),
  upsertProjectMember: (projectId: string, input: UpsertProjectMemberRequest): Promise<ProjectMember> =>
    requestJson<ProjectMember>(`/projects/${projectId}/members`, (value) => ProjectMemberSchema.parse(value), {
      method: "POST",
      body: UpsertProjectMemberRequestSchema.parse(input)
    }),
  updateProjectMember: (projectId: string, userId: string, input: UpdateProjectMemberRequest): Promise<ProjectMember> =>
    requestJson<ProjectMember>(`/projects/${projectId}/members/${userId}`, (value) => ProjectMemberSchema.parse(value), {
      method: "PATCH",
      body: UpdateProjectMemberRequestSchema.parse(input)
    }),
  removeProjectMember: (projectId: string, userId: string): Promise<ArchiveResponse> =>
    requestJson<ArchiveResponse>(`/projects/${projectId}/members/${userId}`, (value) => ArchiveResponseSchema.parse(value), {
      method: "DELETE"
    }),
  listProjectLists: (projectId: string, signal?: AbortSignal): Promise<ListCollection> =>
    requestJson<ListCollection>(
      `/projects/${projectId}/lists`,
      (value) => ListCollectionSchema.parse(value),
      withSignal(signal)
    ),
  createProjectList: (projectId: string, input: CreateListRequest): Promise<ListSummary> =>
    requestJson<ListSummary>(`/projects/${projectId}/lists`, (value) => ListSummarySchema.parse(value), {
      method: "POST",
      body: CreateListRequestSchema.parse(input)
    }),
  updateProjectList: (projectId: string, listId: string, input: UpdateListRequest): Promise<ListSummary> =>
    requestJson<ListSummary>(`/projects/${projectId}/lists/${listId}`, (value) => ListSummarySchema.parse(value), {
      method: "PATCH",
      body: UpdateListRequestSchema.parse(input)
    }),
  archiveProjectList: (projectId: string, listId: string): Promise<ArchiveResponse> =>
    requestJson<ArchiveResponse>(`/projects/${projectId}/lists/${listId}`, (value) => ArchiveResponseSchema.parse(value), {
      method: "DELETE"
    }),
  listProjectStatuses: (projectId: string, options: StatusListOptions = {}): Promise<TaskStatusCollection> =>
    requestJson<TaskStatusCollection>(
      `/projects/${projectId}/statuses${buildQueryString({ listId: options.listId })}`,
      (value) => TaskStatusCollectionSchema.parse(value),
      withSignal(options.signal)
    ),
  listProjectTasks: (projectId: string, options: TaskPageOptions = {}): Promise<TaskPage> =>
    requestJson<TaskPage>(
      `/projects/${projectId}/tasks${buildQueryString({
        listId: options.listId,
        limit: options.limit,
        cursor: options.cursor
      })}`,
      (value) => TaskPageSchema.parse(value),
      withSignal(options.signal)
    ),
  getTaskDetail: (projectId: string, taskId: string, signal?: AbortSignal): Promise<TaskDetailResponse> =>
    requestJson<TaskDetailResponse>(
      `/projects/${projectId}/tasks/${taskId}`,
      (value) => TaskDetailResponseSchema.parse(value),
      withSignal(signal)
    ),
  createTask: (projectId: string, input: CreateTaskRequest): Promise<TaskSummary> =>
    requestJson<TaskSummary>(`/projects/${projectId}/tasks`, (value) => TaskSummarySchema.parse(value), {
      method: "POST",
      body: CreateTaskRequestSchema.parse(input)
    }),
  updateTask: (projectId: string, taskId: string, input: UpdateTaskRequest): Promise<TaskDetailResponse> =>
    requestJson<TaskDetailResponse>(`/projects/${projectId}/tasks/${taskId}`, (value) => TaskDetailResponseSchema.parse(value), {
      method: "PATCH",
      body: UpdateTaskRequestSchema.parse(input)
    }),
  createTaskComment: (
    projectId: string,
    taskId: string,
    input: CreateTaskCommentRequest
  ): Promise<TaskDetailResponse> =>
    requestJson<TaskDetailResponse>(
      `/projects/${projectId}/tasks/${taskId}/comments`,
      (value) => TaskDetailResponseSchema.parse(value),
      {
        method: "POST",
        body: CreateTaskCommentRequestSchema.parse(input)
      }
    ),
  login: (input: LoginRequest): Promise<AuthSession> =>
    requestJson<AuthSession>("/auth/login", (value) => AuthSessionSchema.parse(value), {
      method: "POST",
      body: LoginRequestSchema.parse(input)
    }),
  logout: () =>
    requestJson("/auth/logout", (value) => LogoutResponseSchema.parse(value), {
      method: "POST"
    }),
  refreshSession: (): Promise<AuthSession> =>
    requestJson<AuthSession>("/auth/refresh", (value) => AuthSessionSchema.parse(value), {
      method: "POST"
    })
};
