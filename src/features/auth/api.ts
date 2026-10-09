import type { LoginRequest } from "@/contracts/schemas";
import { api } from "@/lib/api/client";
import {
  ChangePasswordResponseSchema,
  OkResponseSchema,
  SessionContextSchema,
  SessionResponseSchema
} from "@/lib/api/schemas";

export const authApi = {
  login: (input: LoginRequest) =>
    api.post("/auth/login", SessionResponseSchema, input, { auth: "none" }),
  logout: () => api.post("/auth/logout", OkResponseSchema, undefined, { auth: "none" }),
  /** Session + organization + role. 401 (after one refresh attempt) means "signed out". */
  getContext: (signal?: AbortSignal, auth: "default" | "silent" = "silent") =>
    api.get("/workspace/context", SessionContextSchema, { signal, auth }),
  /** Rotates cookies server-side; `reauthenticate` = sign in again (cookies were cleared). */
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    api.post("/auth/change-password", ChangePasswordResponseSchema, input)
};
