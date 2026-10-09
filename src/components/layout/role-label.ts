const roleLabelsByKey: Record<string, string> = {
  superadmin: "Siêu quản trị",
  admin: "Quản trị viên",
  manager: "Quản lý",
  member: "Thành viên"
};

/** Localized name for built-in roles; custom roles keep their own name. */
export const roleLabel = (role: { key: string; name: string }) =>
  roleLabelsByKey[role.key] ?? role.name;
