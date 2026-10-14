/**
 * Cài đặt → Vai trò & phân quyền (PD-042): the organization-role permissions shown on the page, grouped by
 * feature, with a label and a one-line description each. Pure data and helpers (no React).
 *
 * status.view / status.create / status.update / status.delete are deliberately NOT shown: the API never enforces
 * create / update / delete, and status.view is implied by task.view (the workflow read accepts either). They stay
 * in the database: saving a role keeps whatever hidden keys it already has (`withHiddenKeys`).
 */

export type OrgPermissionRow = {
  key: string;
  label: string;
  description: string;
};

export type OrgPermissionGroup = {
  id: string;
  title: string;
  description: string;
  rows: readonly OrgPermissionRow[];
};

/** Production department (the ClickUp-style workspace): projects, their lists and tasks. */
export const productionGroups: readonly OrgPermissionGroup[] = [
  {
    id: "project",
    title: "Dự án",
    description: "Không gian làm việc của một nhóm hoặc khách hàng, chứa các danh sách công việc.",
    rows: [
      { key: "project.view", label: "Xem dự án", description: "Thấy các dự án mình được vào." },
      { key: "project.create", label: "Tạo dự án", description: "Tạo dự án mới trong phòng." },
      {
        key: "project.update",
        label: "Sửa dự án",
        description: "Đổi tên, mô tả, biểu tượng và chế độ công khai của dự án."
      },
      {
        key: "project.delete",
        label: "Lưu trữ dự án",
        description: "Đưa dự án vào lưu trữ (khôi phục được)."
      },
      {
        key: "project.manage_members",
        label: "Quản lý thành viên dự án",
        description: "Mời hoặc gỡ người khỏi dự án và đổi quyền của họ trong dự án."
      }
    ]
  },
  {
    id: "list",
    title: "Danh sách trong dự án",
    description: "Nhóm công việc bên trong một dự án, ví dụ Tháng 7, Đợt 1.",
    rows: [
      { key: "list.view", label: "Xem danh sách", description: "Mở các danh sách của dự án." },
      {
        key: "list.create",
        label: "Tạo danh sách",
        description: "Thêm danh sách mới vào dự án."
      },
      {
        key: "list.update",
        label: "Sửa danh sách",
        description: "Đổi tên, sắp xếp lại danh sách."
      },
      {
        key: "list.delete",
        label: "Lưu trữ danh sách",
        description: "Đưa danh sách vào lưu trữ (khôi phục được)."
      }
    ]
  },
  {
    id: "task",
    title: "Công việc",
    description: "Từng việc trong danh sách: người làm, hạn, trạng thái, bình luận.",
    rows: [
      {
        key: "task.view",
        label: "Xem công việc",
        description: "Thấy công việc và trạng thái của chúng trong dự án mình được vào."
      },
      { key: "task.create", label: "Tạo công việc", description: "Thêm công việc mới." },
      {
        key: "task.update",
        label: "Sửa công việc",
        description: "Đổi tiêu đề, mô tả, hạn, trạng thái và các trường của công việc."
      },
      {
        key: "task.delete",
        label: "Xóa công việc",
        description: "Chuyển công việc vào Thùng rác."
      },
      {
        key: "task.assign",
        label: "Giao việc",
        description: "Chọn hoặc đổi người làm công việc."
      },
      {
        key: "task.comment",
        label: "Bình luận",
        description: "Viết bình luận trong công việc."
      }
    ]
  },
  {
    id: "status",
    title: "Trạng thái công việc",
    description: "Các cột trạng thái (Cần làm, Đang làm, Xong…) của dự án hoặc danh sách.",
    rows: [
      {
        key: "list.manage_status",
        label: "Quản lý trạng thái công việc",
        description: "Thêm, đổi tên, đổi màu, sắp xếp và xóa trạng thái của dự án / danh sách."
      }
    ]
  }
];

/** Shared by both departments ("Chung"). */
export const commonGroups: readonly OrgPermissionGroup[] = [
  {
    id: "channel",
    title: "Kênh chat",
    description: "Kênh trò chuyện nhóm trong Chat (tin nhắn riêng không cần quyền).",
    rows: [
      { key: "channel.view", label: "Xem kênh", description: "Thấy và đọc các kênh mình được vào." },
      { key: "channel.create", label: "Tạo kênh", description: "Tạo kênh chat mới." },
      {
        key: "channel.update",
        label: "Sửa kênh",
        description: "Đổi tên, mô tả và cài đặt của kênh."
      },
      { key: "channel.delete", label: "Xóa kênh", description: "Xóa hoặc lưu trữ kênh." },
      {
        key: "channel.manage_members",
        label: "Quản lý thành viên kênh",
        description: "Thêm hoặc gỡ người khỏi kênh."
      }
    ]
  },
  {
    id: "knowledge",
    title: "Kho tri thức",
    description: "Tài liệu, hướng dẫn dùng chung cho cả hai phòng.",
    rows: [
      {
        key: "knowledge.view",
        label: "Xem tri thức",
        description: "Mở Kho tri thức và đọc bài trong các không gian mình được vào."
      },
      {
        key: "knowledge.create",
        label: "Tạo không gian / bài",
        description: "Tạo không gian tri thức và bài viết mới."
      },
      {
        key: "knowledge.update",
        label: "Sửa tri thức",
        description: "Sửa bài viết, danh mục và cài đặt không gian."
      },
      {
        key: "knowledge.delete",
        label: "Xóa tri thức",
        description: "Xóa bài viết hoặc không gian (vào thùng rác của kho)."
      },
      {
        key: "knowledge.manage_members",
        label: "Quản lý thành viên kho",
        description: "Mời hoặc gỡ người khỏi không gian tri thức."
      }
    ]
  },
  {
    id: "member",
    title: "Thành viên",
    description: "Tài khoản của mọi người trong tổ chức.",
    rows: [
      {
        key: "member.view",
        label: "Xem thành viên",
        description: "Mở Cài đặt → Thành viên và xem danh sách tài khoản."
      },
      {
        key: "member.manage",
        label: "Quản lý thành viên",
        description: "Tạo tài khoản, đổi vai trò, phòng ban, khóa và đặt lại mật khẩu."
      }
    ]
  },
  {
    id: "role",
    title: "Vai trò",
    description: "Trang này: vai trò tổ chức và quyền của chúng.",
    rows: [
      { key: "role.view", label: "Xem vai trò", description: "Mở trang Vai trò & phân quyền." },
      { key: "role.create", label: "Tạo vai trò", description: "Tạo vai trò tùy chỉnh mới." },
      {
        key: "role.update",
        label: "Đổi tên vai trò",
        description: "Đổi tên và mô tả của vai trò tùy chỉnh."
      },
      {
        key: "role.delete",
        label: "Xóa vai trò",
        description: "Xóa vai trò tùy chỉnh không còn ai được gán."
      },
      {
        key: "role.assign_permission",
        label: "Gán quyền cho vai trò",
        description: "Bật / tắt các ô quyền trên trang này."
      }
    ]
  }
];

/** Read-only row of the "Chung" block: departments are not a role permission. */
export const departmentNote = {
  label: "Phòng ban — gán khi tạo/sửa thành viên",
  description:
    "Phòng ban không phải quyền của vai trò: chọn ở Cài đặt → Thành viên (hoặc Cấu hình Photo Retouch → Thành viên & vai trò) khi tạo / sửa từng người."
} as const;

/** Keys never shown on the page (kept untouched in the database). */
export const hiddenPermissionKeys: ReadonlySet<string> = new Set([
  "status.view",
  "status.create",
  "status.update",
  "status.delete"
]);

export const visiblePermissionKeys = (groups: readonly OrgPermissionGroup[]) =>
  groups.flatMap((group) => group.rows.map((row) => row.key));

/** Every key a role cell can toggle on this page. */
export const editablePermissionKeys: ReadonlySet<string> = new Set(
  visiblePermissionKeys([...productionGroups, ...commonGroups])
);

/**
 * The permission list to save for a role: the page's selection of the keys it shows, plus every other key the role
 * already holds (hidden status.* and anything this page does not know). Nothing is stripped or added by accident.
 */
export const withHiddenKeys = (current: readonly string[], selection: ReadonlySet<string>) => {
  const kept = current.filter((key) => !editablePermissionKeys.has(key));
  const chosen = [...selection].filter((key) => editablePermissionKeys.has(key));
  return [...new Set([...kept, ...chosen])].sort();
};

/** Role order on the page: built-in roles first (superadmin → member), then custom roles by name. */
const builtInOrder = ["superadmin", "admin", "manager", "member"];

export const sortOrgRoles = <T extends { key: string; name: string }>(roles: readonly T[]): T[] =>
  [...roles].sort((a, b) => {
    const ai = builtInOrder.indexOf(a.key);
    const bi = builtInOrder.indexOf(b.key);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.name.localeCompare(b.name, "vi");
  });

/** Number of cells that differ between a role's saved keys and its draft (only keys this page shows). */
export const countChanges = (saved: readonly string[], draft: ReadonlySet<string>) => {
  const before = new Set(saved.filter((key) => editablePermissionKeys.has(key)));
  let changes = 0;
  for (const key of editablePermissionKeys) if (before.has(key) !== draft.has(key)) changes += 1;
  return changes;
};
