import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  Permission,
  type EditableMembershipStatus,
  type ManagedRole,
  type MembershipStatus,
  type PermissionKey,
  type ProjectAccessLevel,
  type ProjectSummary
} from "../../contracts";
import { apiClient } from "../../lib/api-client.js";

type AdminPanelProps = {
  currentUserId: string;
  hasFullOrganizationAuthority: boolean;
  permissions: PermissionKey[];
  project: ProjectSummary | null;
};

type RoleFormState = {
  key: string;
  name: string;
  description: string;
};

type ProjectMemberFormState = {
  userId: string;
  accessLevel: ProjectAccessLevel;
};

type PermissionDraftState = {
  roleId: string | null;
  permissions: PermissionKey[];
};

const emptyRoleForm: RoleFormState = {
  key: "",
  name: "",
  description: ""
};

const defaultProjectMemberForm: ProjectMemberFormState = {
  userId: "",
  accessLevel: "submit"
};

const projectAccessLabels: Record<ProjectAccessLevel, string> = {
  view: "Chỉ xem",
  submit: "Thao tác",
  manage: "Quản lý"
};

const membershipStatusLabels: Record<MembershipStatus, string> = {
  invited: "Đã mời",
  active: "Đang hoạt động",
  disabled: "Đã vô hiệu"
};

const roleLabelsByKey: Record<string, string> = {
  superadmin: "Siêu quản trị",
  admin: "Quản trị viên",
  manager: "Quản lý",
  member: "Thành viên"
};

const moduleLabels: Record<string, string> = {
  project: "Dự án",
  list: "Danh sách",
  task: "Công việc",
  status: "Trạng thái",
  channel: "Kênh",
  knowledge: "Tri thức",
  role: "Vai trò"
};

const permissionLabels: Record<PermissionKey, string> = {
  [Permission.ProjectView]: "Xem dự án",
  [Permission.ProjectCreate]: "Tạo dự án",
  [Permission.ProjectUpdate]: "Cập nhật dự án",
  [Permission.ProjectDelete]: "Lưu trữ dự án",
  [Permission.ProjectManageMembers]: "Quản lý thành viên dự án",
  [Permission.ListView]: "Xem danh sách",
  [Permission.ListCreate]: "Tạo danh sách",
  [Permission.ListUpdate]: "Cập nhật danh sách",
  [Permission.ListDelete]: "Lưu trữ danh sách",
  [Permission.ListManageStatus]: "Quản lý trạng thái danh sách",
  [Permission.TaskView]: "Xem công việc",
  [Permission.TaskCreate]: "Tạo công việc",
  [Permission.TaskUpdate]: "Cập nhật công việc",
  [Permission.TaskDelete]: "Xóa công việc",
  [Permission.TaskAssign]: "Giao việc",
  [Permission.StatusView]: "Xem trạng thái",
  [Permission.StatusCreate]: "Tạo trạng thái",
  [Permission.StatusUpdate]: "Cập nhật trạng thái",
  [Permission.StatusDelete]: "Xóa trạng thái",
  [Permission.ChannelView]: "Xem kênh",
  [Permission.ChannelCreate]: "Tạo kênh",
  [Permission.ChannelUpdate]: "Cập nhật kênh",
  [Permission.ChannelDelete]: "Xóa kênh",
  [Permission.ChannelManageMembers]: "Quản lý thành viên kênh",
  [Permission.KnowledgeView]: "Xem tri thức",
  [Permission.KnowledgeCreate]: "Tạo kho tri thức",
  [Permission.KnowledgeUpdate]: "Cập nhật tri thức",
  [Permission.KnowledgeDelete]: "Xóa tri thức",
  [Permission.KnowledgeManageMembers]: "Quản lý thành viên tri thức",
  [Permission.RoleView]: "Xem vai trò",
  [Permission.RoleCreate]: "Tạo vai trò",
  [Permission.RoleUpdate]: "Cập nhật vai trò",
  [Permission.RoleDelete]: "Xóa vai trò",
  [Permission.RoleAssignPermission]: "Gán quyền cho vai trò"
};

const normalizeRoleKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, 79);

const roleKeyPattern = /^[a-z][a-z0-9_]{1,78}$/;

const uniquePermissions = (permissions: PermissionKey[]) => [...new Set(permissions)];

const formatRoleName = (role: { key: string; name: string }) => roleLabelsByKey[role.key] ?? role.name;

const memberName = (user: { displayName: string; email: string | null }) =>
  user.email ? `${user.displayName} (${user.email})` : user.displayName;

export const AdminPanel = ({
  currentUserId,
  hasFullOrganizationAuthority,
  permissions,
  project
}: AdminPanelProps) => {
  const queryClient = useQueryClient();
  const [roleForm, setRoleForm] = useState<RoleFormState>(emptyRoleForm);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [permissionDraftState, setPermissionDraftState] = useState<PermissionDraftState>({
    roleId: null,
    permissions: []
  });
  const [projectMemberForm, setProjectMemberForm] = useState<ProjectMemberFormState>(defaultProjectMemberForm);
  const [adminError, setAdminError] = useState<string | null>(null);

  const can = (permission: PermissionKey) => hasFullOrganizationAuthority || permissions.includes(permission);
  const canViewRoles = can(Permission.RoleView);
  const canCreateRole = can(Permission.RoleCreate);
  const canUpdateRole = can(Permission.RoleUpdate);
  const canDeleteRole = can(Permission.RoleDelete);
  const canAssignPermissions = can(Permission.RoleAssignPermission);
  const canManageProjectMembers = can(Permission.ProjectManageMembers);

  const permissionsQuery = useQuery({
    queryKey: ["workspace", "permissions"],
    enabled: canViewRoles,
    queryFn: ({ signal }) => apiClient.listPermissions(signal),
    retry: false
  });

  const rolesQuery = useQuery({
    queryKey: ["workspace", "roles"],
    enabled: canViewRoles,
    queryFn: ({ signal }) => apiClient.listRoles(signal),
    retry: false
  });

  const organizationMembersQuery = useQuery({
    queryKey: ["workspace", "organization", "members"],
    enabled: canViewRoles,
    queryFn: ({ signal }) => apiClient.listOrganizationMembers(signal),
    retry: false
  });

  const projectMembersQuery = useQuery({
    queryKey: ["workspace", "projects", project?.id ?? null, "members"],
    enabled: Boolean(project?.id && canManageProjectMembers),
    queryFn: ({ signal }) => {
      if (!project) {
        throw new Error("Thiếu dự án");
      }

      return apiClient.listProjectMembers(project.id, signal);
    },
    retry: false
  });

  const roles = useMemo(() => rolesQuery.data?.items ?? [], [rolesQuery.data?.items]);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;
  const permissionGroups = useMemo(() => {
    const groups = new Map<string, PermissionKey[]>();
    for (const permission of permissionsQuery.data?.items ?? []) {
      const entries = groups.get(permission.module) ?? [];
      entries.push(permission.key);
      groups.set(permission.module, entries);
    }

    return [...groups.entries()];
  }, [permissionsQuery.data?.items]);
  const organizationMembers = useMemo(
    () => organizationMembersQuery.data?.items ?? [],
    [organizationMembersQuery.data?.items]
  );
  const activeOrganizationMembers = useMemo(
    () => organizationMembers.filter((member) => member.status === "active"),
    [organizationMembers]
  );
  const projectMembers = useMemo(() => projectMembersQuery.data?.items ?? [], [projectMembersQuery.data?.items]);
  const activeProjectMemberIds = useMemo(
    () => new Set(projectMembers.map((member) => member.user.id)),
    [projectMembers]
  );
  const availableProjectMembers = useMemo(
    () => activeOrganizationMembers.filter((member) => !activeProjectMemberIds.has(member.user.id)),
    [activeOrganizationMembers, activeProjectMemberIds]
  );
  const permissionDraft =
    permissionDraftState.roleId === selectedRole?.id
      ? permissionDraftState.permissions
      : selectedRole?.permissions ?? [];
  const selectedProjectMemberUserId =
    projectMemberForm.userId && availableProjectMembers.some((member) => member.user.id === projectMemberForm.userId)
      ? projectMemberForm.userId
      : availableProjectMembers[0]?.user.id ?? "";

  const invalidateAdminData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace", "roles"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", "organization", "members"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", "context"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", "projects", project?.id ?? null, "members"] })
    ]);
  };

  const createRoleMutation = useMutation({
    mutationFn: apiClient.createRole,
    onSuccess: async (role) => {
      setAdminError(null);
      setSelectedRoleId(role.id);
      setRoleForm(emptyRoleForm);
      await invalidateAdminData();
    },
    onError: () => setAdminError("Không tạo được vai trò. Kiểm tra mã vai trò và quyền hiện tại.")
  });

  const updateRolePermissionsMutation = useMutation({
    mutationFn: (input: { role: ManagedRole; permissions: PermissionKey[] }) =>
      apiClient.updateRolePermissions(input.role.id, { permissions: uniquePermissions(input.permissions) }),
    onSuccess: async (role) => {
      setAdminError(null);
      setSelectedRoleId(role.id);
      await invalidateAdminData();
    },
    onError: () => setAdminError("Không lưu được quyền của vai trò.")
  });

  const archiveRoleMutation = useMutation({
    mutationFn: apiClient.archiveRole,
    onSuccess: async () => {
      setAdminError(null);
      setSelectedRoleId(null);
      await invalidateAdminData();
    },
    onError: () => setAdminError("Không thể xóa vai trò đang được dùng hoặc vai trò hệ thống.")
  });

  const updateOrganizationMemberMutation = useMutation({
    mutationFn: (input: { membershipId: string; roleId?: string; status?: EditableMembershipStatus }) =>
      apiClient.updateOrganizationMember(input.membershipId, {
        ...(input.roleId ? { roleId: input.roleId } : {}),
        ...(input.status ? { status: input.status } : {})
      }),
    onSuccess: async () => {
      setAdminError(null);
      await invalidateAdminData();
    },
    onError: () => setAdminError("Không cập nhật được thành viên tổ chức.")
  });

  const upsertProjectMemberMutation = useMutation({
    mutationFn: (input: ProjectMemberFormState) => {
      if (!project) {
        throw new Error("Thiếu dự án");
      }

      return apiClient.upsertProjectMember(project.id, input);
    },
    onSuccess: async () => {
      setAdminError(null);
      setProjectMemberForm(defaultProjectMemberForm);
      await invalidateAdminData();
    },
    onError: () => setAdminError("Không thêm được thành viên vào dự án.")
  });

  const updateProjectMemberMutation = useMutation({
    mutationFn: (input: { userId: string; accessLevel: ProjectAccessLevel }) => {
      if (!project) {
        throw new Error("Thiếu dự án");
      }

      return apiClient.updateProjectMember(project.id, input.userId, { accessLevel: input.accessLevel });
    },
    onSuccess: async () => {
      setAdminError(null);
      await invalidateAdminData();
    },
    onError: () => setAdminError("Không cập nhật được quyền thành viên dự án.")
  });

  const removeProjectMemberMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!project) {
        throw new Error("Thiếu dự án");
      }

      return apiClient.removeProjectMember(project.id, userId);
    },
    onSuccess: async () => {
      setAdminError(null);
      await invalidateAdminData();
    },
    onError: () => setAdminError("Không thể xóa quản lý cuối cùng của dự án.")
  });

  const handleCreateRole = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = normalizeRoleKey(roleForm.key);
    if (!roleKeyPattern.test(key) || !roleForm.name.trim()) {
      setAdminError("Mã vai trò phải bắt đầu bằng chữ thường và chỉ gồm chữ, số hoặc dấu gạch dưới.");
      return;
    }

    createRoleMutation.mutate({
      key,
      name: roleForm.name.trim(),
      permissions: [],
      ...(roleForm.description.trim() ? { description: roleForm.description.trim() } : {})
    });
  };

  const handleSavePermissions = () => {
    if (!selectedRole || selectedRole.isSystem) {
      return;
    }

    updateRolePermissionsMutation.mutate({ role: selectedRole, permissions: permissionDraft });
  };

  const handleAddProjectMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectMemberUserId) {
      setAdminError("Chọn một thành viên tổ chức trước khi thêm vào dự án.");
      return;
    }

    upsertProjectMemberMutation.mutate({
      userId: selectedProjectMemberUserId,
      accessLevel: projectMemberForm.accessLevel
    });
  };

  const togglePermission = (permission: PermissionKey) => {
    if (!selectedRole) {
      return;
    }

    setPermissionDraftState((current) => {
      const currentPermissions = current.roleId === selectedRole.id ? current.permissions : selectedRole.permissions;
      return {
        roleId: selectedRole.id,
        permissions: currentPermissions.includes(permission)
          ? currentPermissions.filter((item) => item !== permission)
          : [...currentPermissions, permission]
      };
    });
  };

  if (!canViewRoles && !canManageProjectMembers) {
    return (
      <section className="admin-empty" aria-label="Quản trị">
        <ShieldCheck size={24} />
        <h2>Chưa có quyền quản trị</h2>
        <p>Vai trò hiện tại chưa được phép xem hoặc thay đổi cấu hình tổ chức.</p>
      </section>
    );
  }

  return (
    <section className="admin-layout" aria-label="Quản trị hệ thống">
      <div className="admin-column">
        <section className="admin-section">
          <div className="admin-section-heading">
            <ShieldCheck size={18} />
            <div>
              <h2>Vai trò</h2>
              <p>{roles.length} vai trò trong tổ chức</p>
            </div>
          </div>

          {canCreateRole ? (
            <form className="admin-form" onSubmit={handleCreateRole}>
              <input
                className="text-input"
                onChange={(event) => setRoleForm((form) => ({ ...form, key: normalizeRoleKey(event.target.value) }))}
                placeholder="ma_vai_tro"
                value={roleForm.key}
              />
              <input
                className="text-input"
                onChange={(event) => setRoleForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="Tên vai trò"
                value={roleForm.name}
              />
              <input
                className="text-input"
                onChange={(event) => setRoleForm((form) => ({ ...form, description: event.target.value }))}
                placeholder="Ghi chú vai trò"
                value={roleForm.description}
              />
              <button className="primary-button" disabled={createRoleMutation.isPending} type="submit">
                <Plus size={16} />
                <span>Tạo vai trò</span>
              </button>
            </form>
          ) : null}

          {adminError ? <p className="auth-error">{adminError}</p> : null}
          {rolesQuery.isError || permissionsQuery.isError || organizationMembersQuery.isError ? (
            <p className="auth-error">Không tải được dữ liệu quản trị.</p>
          ) : null}

          <div className="entity-list">
            {rolesQuery.isPending && canViewRoles ? <div className="state-row">Đang tải vai trò</div> : null}
            {roles.map((role) => (
              <button
                className={selectedRole?.id === role.id ? "entity-row active" : "entity-row"}
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                type="button"
              >
                <span>
                  <strong>{formatRoleName(role)}</strong>
                  <small>{role.key}</small>
                </span>
                <span className="status-chip">{role.isSystem ? "Hệ thống" : `${role.permissions.length} quyền`}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-heading">
            <Users size={18} />
            <div>
              <h2>Thành viên tổ chức</h2>
              <p>{organizationMembers.length} thành viên</p>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Thành viên</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {organizationMembers.map((member) => {
                  const isSelf = member.user.id === currentUserId;
                  return (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.user.displayName}</strong>
                        <small>{member.user.email ?? "Chưa có email"}</small>
                      </td>
                      <td>
                        <select
                          className="field-input"
                          disabled={!canUpdateRole || isSelf}
                          onChange={(event) =>
                            updateOrganizationMemberMutation.mutate({
                              membershipId: member.id,
                              roleId: event.target.value
                            })
                          }
                          value={member.role.id}
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {formatRoleName(role)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="field-input"
                          disabled={!canUpdateRole || isSelf}
                          onChange={(event) =>
                            updateOrganizationMemberMutation.mutate({
                              membershipId: member.id,
                              status: event.target.value as EditableMembershipStatus
                            })
                          }
                          value={member.status}
                        >
                          {member.status === "invited" ? <option value="invited">Đã mời</option> : null}
                          <option value="active">Đang hoạt động</option>
                          <option value="disabled">Đã vô hiệu</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="admin-column">
        <section className="admin-section">
          <div className="admin-section-heading">
            <ShieldCheck size={18} />
            <div>
              <h2>Quyền của vai trò</h2>
              <p>{selectedRole ? formatRoleName(selectedRole) : "Chưa chọn vai trò"}</p>
            </div>
          </div>

          {selectedRole ? (
            <>
              {selectedRole.isSystem ? (
                <p className="muted-text">Vai trò hệ thống đang được bảo vệ, không chỉnh quyền trực tiếp trên UI.</p>
              ) : null}
              <div className="permission-groups">
                {permissionGroups.map(([module, modulePermissions]) => (
                  <div className="permission-group" key={module}>
                    <h3>{moduleLabels[module] ?? "Khác"}</h3>
                    <div className="permission-list">
                      {modulePermissions.map((permission) => (
                        <label className="check-row" key={permission}>
                          <input
                            checked={permissionDraft.includes(permission)}
                            disabled={!canAssignPermissions || selectedRole.isSystem}
                            onChange={() => togglePermission(permission)}
                            type="checkbox"
                          />
                          <span>{permissionLabels[permission]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="button-row">
                {canDeleteRole && !selectedRole.isSystem ? (
                  <button
                    className="command-button danger-button"
                    disabled={archiveRoleMutation.isPending}
                    onClick={() => archiveRoleMutation.mutate(selectedRole.id)}
                    type="button"
                  >
                    <Trash2 size={16} />
                    <span>Xóa vai trò</span>
                  </button>
                ) : null}
                <button
                  className="primary-button"
                  disabled={!canAssignPermissions || selectedRole.isSystem || updateRolePermissionsMutation.isPending}
                  onClick={handleSavePermissions}
                  type="button"
                >
                  <Save size={16} />
                  <span>Lưu quyền</span>
                </button>
              </div>
            </>
          ) : (
            <div className="state-row">Chưa có vai trò</div>
          )}
        </section>

        <section className="admin-section">
          <div className="admin-section-heading">
            <Users size={18} />
            <div>
              <h2>Thành viên dự án</h2>
              <p>{project ? project.name : "Chưa chọn dự án"}</p>
            </div>
          </div>

          {project && canManageProjectMembers ? (
            <>
              <form className="admin-form compact-form" onSubmit={handleAddProjectMember}>
                <select
                  className="text-input"
                  onChange={(event) => setProjectMemberForm((form) => ({ ...form, userId: event.target.value }))}
                  value={selectedProjectMemberUserId}
                >
                  {availableProjectMembers.length === 0 ? <option value="">Không còn thành viên để thêm</option> : null}
                  {availableProjectMembers.map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {memberName(member.user)}
                    </option>
                  ))}
                </select>
                <select
                  className="text-input"
                  onChange={(event) =>
                    setProjectMemberForm((form) => ({
                      ...form,
                      accessLevel: event.target.value as ProjectAccessLevel
                    }))
                  }
                  value={projectMemberForm.accessLevel}
                >
                  {Object.entries(projectAccessLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="primary-button"
                  disabled={!selectedProjectMemberUserId || upsertProjectMemberMutation.isPending}
                  type="submit"
                >
                  <Plus size={16} />
                  <span>Thêm</span>
                </button>
              </form>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Thành viên</th>
                      <th>Quyền dự án</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectMembers.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <strong>{member.user.displayName}</strong>
                          <small>{membershipStatusLabels[member.status]}</small>
                        </td>
                        <td>
                          <select
                            className="field-input"
                            onChange={(event) =>
                              updateProjectMemberMutation.mutate({
                                userId: member.user.id,
                                accessLevel: event.target.value as ProjectAccessLevel
                              })
                            }
                            value={member.accessLevel}
                          >
                            {Object.entries(projectAccessLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className="icon-button danger-icon"
                            disabled={removeProjectMemberMutation.isPending}
                            onClick={() => removeProjectMemberMutation.mutate(member.user.id)}
                            type="button"
                            aria-label={`Xóa ${member.user.displayName} khỏi dự án`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="state-row">
              {project ? "Chưa có quyền quản lý thành viên dự án" : "Chọn dự án để quản lý thành viên"}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};
