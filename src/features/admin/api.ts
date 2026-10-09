import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, apiPath } from "@/lib/api/client";
import {
  AdminMemberCollectionSchema,
  AdminMemberSchema,
  AdminPermissionCollectionSchema,
  AdminRoleCollectionSchema,
  AdminRoleSchema,
  CreatedMemberResponseSchema,
  OkResponseSchema,
  TemporaryPasswordResponseSchema
} from "@/lib/api/schemas";
import { qk } from "@/lib/query-keys";

export type CreateMemberInput = {
  email: string;
  displayName: string;
  roleId: string;
  jobTitle?: string | null;
};
export type CreateRoleInput = {
  key: string;
  name: string;
  description?: string | null;
  permissions: string[];
};

/** Organization administration (BE workspace.routes.ts). Permission keys are read leniently. */
export const adminApi = {
  permissions: (signal?: AbortSignal) =>
    api.get("/permissions", AdminPermissionCollectionSchema, { signal }),
  roles: (signal?: AbortSignal) => api.get("/roles", AdminRoleCollectionSchema, { signal }),
  createRole: (input: CreateRoleInput) => api.post("/roles", AdminRoleSchema, input),
  updateRole: (roleId: string, input: { name?: string; description?: string | null }) =>
    api.patch(apiPath`/roles/${roleId}`, AdminRoleSchema, input),
  updateRolePermissions: (roleId: string, permissions: string[]) =>
    api.patch(apiPath`/roles/${roleId}/permissions`, AdminRoleSchema, { permissions }),
  archiveRole: (roleId: string) => api.delete(apiPath`/roles/${roleId}`, OkResponseSchema),

  members: (signal?: AbortSignal) =>
    api.get("/organization/members", AdminMemberCollectionSchema, { signal }),
  createMember: (input: CreateMemberInput) =>
    api.post("/organization/members", CreatedMemberResponseSchema, input),
  updateMember: (
    membershipId: string,
    input: { roleId?: string; status?: "active" | "disabled" }
  ) => api.patch(apiPath`/organization/members/${membershipId}`, AdminMemberSchema, input),
  resetPassword: (membershipId: string) =>
    api.post(
      apiPath`/organization/members/${membershipId}/reset-password`,
      TemporaryPasswordResponseSchema
    )
};

export const useAdminPermissions = (enabled = true) =>
  useQuery({
    queryKey: qk.admin.permissions(),
    queryFn: ({ signal }) => adminApi.permissions(signal),
    staleTime: 10 * 60_000,
    enabled
  });

export const useAdminRoles = (enabled = true) =>
  useQuery({
    queryKey: qk.admin.roles(),
    queryFn: ({ signal }) => adminApi.roles(signal),
    enabled
  });

export const useAdminMembers = (enabled = true) =>
  useQuery({
    queryKey: qk.admin.members(),
    queryFn: ({ signal }) => adminApi.members(signal),
    enabled
  });

/** Role/membership changes can alter the current user's own permissions: refresh the session too. */
const useAdminRefresh = () => {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: qk.admin.all() }),
      client.invalidateQueries({ queryKey: qk.session() })
    ]);
};

export const useRoleMutations = () => {
  const refresh = useAdminRefresh();
  return {
    create: useMutation({
      mutationFn: adminApi.createRole,
      meta: { errorMessage: false },
      onSuccess: refresh
    }),
    update: useMutation({
      mutationFn: ({
        roleId,
        input
      }: {
        roleId: string;
        input: { name?: string; description?: string | null };
      }) => adminApi.updateRole(roleId, input),
      meta: { successMessage: "Đã cập nhật vai trò" },
      onSuccess: refresh
    }),
    setPermissions: useMutation({
      mutationFn: ({ roleId, permissions }: { roleId: string; permissions: string[] }) =>
        adminApi.updateRolePermissions(roleId, permissions),
      meta: { successMessage: "Đã lưu quyền của vai trò" },
      onSuccess: refresh
    }),
    archive: useMutation({
      mutationFn: adminApi.archiveRole,
      meta: { successMessage: "Đã xóa vai trò" },
      onSuccess: refresh
    })
  };
};

export const useMemberMutations = () => {
  const refresh = useAdminRefresh();
  return {
    create: useMutation({
      mutationFn: adminApi.createMember,
      meta: { errorMessage: false },
      onSuccess: refresh
    }),
    update: useMutation({
      mutationFn: ({
        membershipId,
        input
      }: {
        membershipId: string;
        input: { roleId?: string; status?: "active" | "disabled" };
      }) => adminApi.updateMember(membershipId, input),
      meta: { successMessage: "Đã cập nhật thành viên" },
      onSuccess: refresh
    }),
    resetPassword: useMutation({
      mutationFn: adminApi.resetPassword,
      meta: { errorMessage: false }
    })
  };
};
