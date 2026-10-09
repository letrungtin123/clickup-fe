import { z } from "zod";

import {
  AddAllowedEmailsResultSchema,
  AllowedEmailCollectionSchema,
  ClientCollectionSchema,
  CreditImportResultSchema,
  CreditMatrixSchema,
  CreditRuleHistorySchema,
  CustomFieldCollectionSchema,
  NotificationPreferencesSchema,
  ProcessCollectionSchema,
  ProductionMeSchema,
  ProductionMemberCollectionSchema,
  ProductionMemberSchema,
  ProductionProjectCollectionSchema,
  ProductionSettingsSchema,
  ShiftCollectionSchema,
  StatusWorkflowSchema,
  TagCollectionSchema,
  TeamCollectionSchema,
  type CreditImportRequestSchema,
  type ReplaceTransitionsRequestSchema,
  type SetCreditRuleRequestSchema,
  type UpdateNotificationPreferencesRequestSchema,
  type UpdateProductionMemberRequestSchema,
  type UpdateProductionSettingsRequestSchema,
  type UpsertClientRequestSchema,
  type UpsertCustomFieldRequestSchema,
  type UpsertProcessRequestSchema,
  type UpsertProductionProjectRequestSchema,
  type UpsertShiftRequestSchema,
  type UpsertStatusRequestSchema,
  type UpsertTagRequestSchema,
  type UpsertTeamRequestSchema
} from "@/contracts/production-catalog";
import { api, apiPath } from "@/lib/api/client";
import { OkResponseSchema } from "@/lib/api/schemas";

/**
 * Production catalog API (BE modules/production, SPEC Phase 0–1). Every response is parsed with the
 * shared contract. Create/update endpoints answer with the whole refreshed collection, so callers
 * can replace the cached list directly.
 */

export type UpdateMemberInput = z.input<typeof UpdateProductionMemberRequestSchema>;
export type TeamInput = z.input<typeof UpsertTeamRequestSchema>;
export type ClientInput = z.input<typeof UpsertClientRequestSchema>;
export type ProjectInput = z.input<typeof UpsertProductionProjectRequestSchema>;
export type ProcessInput = z.input<typeof UpsertProcessRequestSchema>;
export type ShiftInput = z.input<typeof UpsertShiftRequestSchema>;
export type SetCreditRuleInput = z.input<typeof SetCreditRuleRequestSchema>;
export type CreditImportInput = z.input<typeof CreditImportRequestSchema>;
export type StatusInput = z.input<typeof UpsertStatusRequestSchema>;
export type TransitionsInput = z.input<typeof ReplaceTransitionsRequestSchema>;
export type CustomFieldInput = z.input<typeof UpsertCustomFieldRequestSchema>;
export type TagInput = z.input<typeof UpsertTagRequestSchema>;
export type SettingsInput = z.input<typeof UpdateProductionSettingsRequestSchema>;
export type NotificationPreferencesInput = z.input<
  typeof UpdateNotificationPreferencesRequestSchema
>;

/** POST /credit-rules/versions answers how many rules were copied into the new version. */
const CreditVersionResultSchema = z.object({ created: z.number().int() });

export const productionApi = {
  me: (signal?: AbortSignal) => api.get("/production/me", ProductionMeSchema, { signal }),

  members: (signal?: AbortSignal) =>
    api.get("/production/members", ProductionMemberCollectionSchema, { signal }),
  updateMember: (userId: string, input: UpdateMemberInput) =>
    api.patch(apiPath`/production/members/${userId}`, ProductionMemberSchema, input),

  teams: (signal?: AbortSignal) => api.get("/production/teams", TeamCollectionSchema, { signal }),
  createTeam: (input: TeamInput) => api.post("/production/teams", TeamCollectionSchema, input),
  updateTeam: (id: string, input: TeamInput) =>
    api.patch(apiPath`/production/teams/${id}`, TeamCollectionSchema, input),

  clients: (signal?: AbortSignal) =>
    api.get("/production/clients", ClientCollectionSchema, { signal }),
  createClient: (input: ClientInput) =>
    api.post("/production/clients", ClientCollectionSchema, input),
  updateClient: (id: string, input: ClientInput) =>
    api.patch(apiPath`/production/clients/${id}`, ClientCollectionSchema, input),

  projects: (signal?: AbortSignal) =>
    api.get("/production/projects", ProductionProjectCollectionSchema, { signal }),
  createProject: (input: ProjectInput) =>
    api.post("/production/projects", ProductionProjectCollectionSchema, input),
  updateProject: (id: string, input: ProjectInput) =>
    api.patch(apiPath`/production/projects/${id}`, ProductionProjectCollectionSchema, input),

  processes: (signal?: AbortSignal) =>
    api.get("/production/processes", ProcessCollectionSchema, { signal }),
  createProcess: (input: ProcessInput) =>
    api.post("/production/processes", ProcessCollectionSchema, input),
  updateProcess: (id: string, input: ProcessInput) =>
    api.patch(apiPath`/production/processes/${id}`, ProcessCollectionSchema, input),

  shifts: (signal?: AbortSignal) =>
    api.get("/production/shifts", ShiftCollectionSchema, { signal }),
  createShift: (input: ShiftInput) => api.post("/production/shifts", ShiftCollectionSchema, input),
  updateShift: (id: string, input: ShiftInput) =>
    api.patch(apiPath`/production/shifts/${id}`, ShiftCollectionSchema, input),

  creditMatrix: (day: string, signal?: AbortSignal) =>
    api.get("/production/credit-rules/matrix", CreditMatrixSchema, { query: { at: day }, signal }),
  creditHistory: (projectId: string, processId: string, signal?: AbortSignal) =>
    api.get("/production/credit-rules/history", CreditRuleHistorySchema, {
      query: { projectId, processId },
      signal
    }),
  setCreditRule: (input: SetCreditRuleInput) =>
    api.put("/production/credit-rules", CreditRuleHistorySchema, input),
  createCreditVersion: (effectiveFrom: string) =>
    api.post("/production/credit-rules/versions", CreditVersionResultSchema, { effectiveFrom }),
  importCredits: (input: CreditImportInput) =>
    api.post("/production/credit-rules/import", CreditImportResultSchema, input),

  workflow: (signal?: AbortSignal) =>
    api.get("/production/workflow", StatusWorkflowSchema, { signal }),
  createStatus: (input: StatusInput) =>
    api.post("/production/statuses", StatusWorkflowSchema, input),
  updateStatus: (id: string, input: StatusInput) =>
    api.patch(apiPath`/production/statuses/${id}`, StatusWorkflowSchema, input),
  reorderStatuses: (ids: string[]) =>
    api.put("/production/statuses/order", StatusWorkflowSchema, { ids }),
  replaceTransitions: (input: TransitionsInput) =>
    api.put("/production/transitions", StatusWorkflowSchema, input),

  customFields: (signal?: AbortSignal) =>
    api.get("/production/custom-fields", CustomFieldCollectionSchema, { signal }),
  createCustomField: (input: CustomFieldInput) =>
    api.post("/production/custom-fields", CustomFieldCollectionSchema, input),
  updateCustomField: (id: string, input: CustomFieldInput) =>
    api.patch(apiPath`/production/custom-fields/${id}`, CustomFieldCollectionSchema, input),

  tags: (signal?: AbortSignal) => api.get("/production/tags", TagCollectionSchema, { signal }),
  createTag: (input: TagInput) => api.post("/production/tags", TagCollectionSchema, input),
  updateTag: (id: string, input: TagInput) =>
    api.patch(apiPath`/production/tags/${id}`, TagCollectionSchema, input),

  settings: (signal?: AbortSignal) =>
    api.get("/production/settings", ProductionSettingsSchema, { signal }),
  updateSettings: (input: SettingsInput) =>
    api.patch("/production/settings", ProductionSettingsSchema, input),

  allowedEmails: (signal?: AbortSignal) =>
    api.get("/production/allowed-emails", AllowedEmailCollectionSchema, { signal }),
  addAllowedEmails: (text: string) =>
    api.post("/production/allowed-emails", AddAllowedEmailsResultSchema, { text }),
  removeAllowedEmail: (email: string) =>
    api.delete(apiPath`/production/allowed-emails/${email}`, OkResponseSchema),

  notificationPreferences: (signal?: AbortSignal) =>
    api.get("/me/notification-preferences", NotificationPreferencesSchema, { signal }),
  updateNotificationPreferences: (input: NotificationPreferencesInput) =>
    api.patch("/me/notification-preferences", NotificationPreferencesSchema, input)
};
