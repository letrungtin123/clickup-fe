import type { z } from "zod";

import type {
  AddAllowedEmailsResultSchema,
  AllowedEmailSchema,
  ClientSchema,
  CustomFieldOptionSchema,
  NotificationPreferencesSchema,
  TagSchema,
  TeamSchema
} from "@/contracts/production-catalog";

/** Inferred types the shared contract exports only as schemas. */
export type Team = z.infer<typeof TeamSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type CustomFieldOption = z.infer<typeof CustomFieldOptionSchema>;
export type AllowedEmail = z.infer<typeof AllowedEmailSchema>;
export type AddAllowedEmailsResult = z.infer<typeof AddAllowedEmailsResultSchema>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
