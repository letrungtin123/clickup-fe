import { z } from "zod";

import {
  AppUserSchema,
  ManagedRoleSchema,
  NotificationChannelsSchema,
  OrganizationMemberSchema,
  OrganizationSchema,
  PermissionDefinitionSchema,
  RoleSchema
} from "@/contracts/schemas";

/**
 * FE-side tolerant variants of contract schemas.
 *
 * The contract types permission keys as a closed enum, but the database can hold keys the SPA build
 * does not know yet (new permissions roll out server-first). A strict parse would take the whole
 * workspace down, so wherever permission keys are *read* we accept any string and only treat known keys
 * specially. Writes still go through the backend, which validates strictly.
 */
const PermissionKeyListSchema = z.array(z.string().min(1).max(120));

export const CsrfResponseSchema = z.object({ csrfToken: z.string().min(16) });

export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  permissions: PermissionKeyListSchema
});
export const SessionResponseSchema = z.object({ user: SessionUserSchema });

export const SessionRoleSchema = RoleSchema.extend({ permissions: PermissionKeyListSchema });

export const SessionContextSchema = z.object({
  user: AppUserSchema,
  organization: OrganizationSchema,
  role: SessionRoleSchema,
  hasFullOrganizationAuthority: z.boolean(),
  /** Admin-provisioned accounts must replace their temporary password first (PD-005). */
  mustChangePassword: z.boolean().default(false),
  /** Explicit production roles (PD-011); superadmins also act as production ADMIN without one. */
  productionRoles: z.array(z.string().min(1).max(20)).default([]),
  /**
   * Personal channels (PD-021), read fresh by /workspace/context. `notifyWeb` off = no toast for new
   * notifications (inbox, bell and badges still update). Older servers omit it: web on, email off.
   */
  notificationPreferences: NotificationChannelsSchema.default({ notifyWeb: true, notifyEmail: false })
});
export type SessionContext = z.infer<typeof SessionContextSchema>;

export const AdminRoleSchema = ManagedRoleSchema.extend({ permissions: PermissionKeyListSchema });
export type AdminRole = z.infer<typeof AdminRoleSchema>;
export const AdminRoleCollectionSchema = z.object({ items: z.array(AdminRoleSchema) });

export const AdminPermissionSchema = PermissionDefinitionSchema.extend({ key: z.string().min(1) });
export type AdminPermission = z.infer<typeof AdminPermissionSchema>;
export const AdminPermissionCollectionSchema = z.object({ items: z.array(AdminPermissionSchema) });

export const AdminMemberSchema = OrganizationMemberSchema.extend({ role: SessionRoleSchema });
export type AdminMember = z.infer<typeof AdminMemberSchema>;
export const AdminMemberCollectionSchema = z.object({ items: z.array(AdminMemberSchema) });

export const OkResponseSchema = z.object({ ok: z.literal(true) });

export const ChangePasswordResponseSchema = z.object({
  ok: z.literal(true),
  reauthenticate: z.boolean().default(false)
});

export const CreatedMemberResponseSchema = z.object({
  temporaryPassword: z.string().min(1),
  member: AdminMemberSchema
});
export const TemporaryPasswordResponseSchema = z.object({ temporaryPassword: z.string().min(1) });
