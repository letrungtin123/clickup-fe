import { useCallback, useMemo } from "react";

import type { ProductionMember } from "@/contracts/production-catalog";
import { useAdminMembers } from "@/features/admin/api";
import { usePermissions, useSessionContext } from "@/features/auth/hooks";
import { P } from "@/features/auth/permissions";

import { accountLock, lockedRoles, orgAuthorityByUser } from "../../org-admins";

/**
 * Which rows of "Thành viên & vai trò" are protected (org-admins.ts). The production member payload
 * does not say who is an organization admin: viewers allowed to read GET /organization/members
 * (member.view) get the full picture; everyone else sees every action and the API's 403
 * ORG_ADMIN_PROTECTED message explains the refusal.
 */
export const useMemberLocks = () => {
  const session = useSessionContext();
  const { can } = usePermissions();
  const organizationMembers = useAdminMembers(can(P.MemberView));
  const authority = useMemo(
    () =>
      organizationMembers.data ? orgAuthorityByUser(organizationMembers.data.items) : undefined,
    [organizationMembers.data]
  );
  const viewerId = session.user.id;
  const viewerIsSuperadmin = session.hasFullOrganizationAuthority;
  return useCallback(
    (member: Pick<ProductionMember, "userId" | "roles">) => {
      const lock = accountLock({ userId: member.userId, viewerId, viewerIsSuperadmin, authority });
      return { lock, lockedRoles: lockedRoles(lock, { roles: member.roles, viewerIsSuperadmin }) };
    },
    [authority, viewerId, viewerIsSuperadmin]
  );
};
