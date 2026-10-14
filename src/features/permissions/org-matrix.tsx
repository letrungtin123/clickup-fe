import { Ellipsis, Lock, PencilLine, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { roleLabel } from "@/components/layout/role-label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { AdminRole } from "@/lib/api/schemas";

import { CheckCell, GroupRow, HeadCell, MatrixTable, RowHead } from "./matrix-kit";
import type { OrgPermissionGroup } from "./org-catalog";

export type OrgCellState = {
  checked: boolean;
  changed: boolean;
  /** Set when the cell cannot be changed, with the reason. */
  lockReason: string | null;
};

/**
 * Organization roles × permissions (Production view and the "Chung" block). Rows come from the page catalog (only
 * keys the server knows when its catalog is readable); `cell` says what each cell shows and whether it is editable.
 */
export const OrgMatrix = ({
  caption,
  groups,
  roles,
  cell,
  onToggle,
  onRename,
  onDelete,
  footerRows
}: {
  caption: string;
  groups: readonly OrgPermissionGroup[];
  roles: readonly AdminRole[];
  cell: (role: AdminRole, key: string) => OrgCellState;
  onToggle: (role: AdminRole, key: string, checked: boolean) => void;
  onRename?: ((role: AdminRole) => void) | undefined;
  onDelete?: ((role: AdminRole) => void) | undefined;
  /** Extra read-only rows at the end (they span every role column). */
  footerRows?: ReactNode;
}) => (
  <MatrixTable
    caption={caption}
    minWidth={`calc(9rem + ${roles.length} * 5.75rem)`}
    head={roles.map((role) => (
      <HeadCell key={role.id} className="min-w-[5.75rem]">
        <RoleHead role={role} onRename={onRename} onDelete={onDelete} />
      </HeadCell>
    ))}
  >
    {groups.map((group) => (
      <OrgGroup key={group.id} group={group} roles={roles} cell={cell} onToggle={onToggle} />
    ))}
    {footerRows}
  </MatrixTable>
);

const OrgGroup = ({
  group,
  roles,
  cell,
  onToggle
}: {
  group: OrgPermissionGroup;
  roles: readonly AdminRole[];
  cell: (role: AdminRole, key: string) => OrgCellState;
  onToggle: (role: AdminRole, key: string, checked: boolean) => void;
}) => (
  <>
    <GroupRow title={group.title} description={group.description} span={roles.length} />
    {group.rows.map((row) => (
      <tr key={row.key}>
        <RowHead label={row.label} description={row.description} />
        {roles.map((role) => {
          const state = cell(role, row.key);
          return (
            <CheckCell
              key={role.id}
              checked={state.checked}
              changed={state.changed}
              disabled={state.lockReason !== null}
              lockReason={state.lockReason ?? undefined}
              label={`${row.label} — ${roleLabel(role)}`}
              onChange={(checked) => onToggle(role, row.key, checked)}
            />
          );
        })}
      </tr>
    ))}
  </>
);

const RoleHead = ({
  role,
  onRename,
  onDelete
}: {
  role: AdminRole;
  onRename?: ((role: AdminRole) => void) | undefined;
  onDelete?: ((role: AdminRole) => void) | undefined;
}) => {
  const label = roleLabel(role);
  const menu = !role.isSystem && (onRename || onDelete);
  return (
    <span className="flex items-end justify-center gap-0.5">
      <span
        title={role.description ?? label}
        className="line-clamp-2 min-w-0 text-[12px] leading-tight font-semibold break-words text-foreground"
      >
        {label}
      </span>
      {role.isSystem ? (
        <Lock
          className="mb-0.5 size-3 shrink-0 text-foreground-subtle"
          aria-label="Vai trò hệ thống, không chỉnh được"
        />
      ) : null}
      {menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-1 shrink-0"
                aria-label={`Tùy chọn vai trò ${label}`}
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {onRename ? (
              <DropdownMenuItem onClick={() => onRename(role)}>
                <PencilLine />
                Đổi tên
              </DropdownMenuItem>
            ) : null}
            {onRename && onDelete ? <DropdownMenuSeparator /> : null}
            {onDelete ? (
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(role)}>
                <Trash2 />
                Xóa vai trò
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </span>
  );
};
