import { webEnv } from "@/lib/env";

/**
 * "Đăng nhập bằng Google" (PD-012) is a top-level navigation, not a fetch: the API redirects to
 * GoTrue → Google → back to the API callback, which sets the session cookies and returns to `next`.
 * The server sanitizes `next` again; only same-app paths survive.
 */
export const googleStartHref = (next: string) => {
  const params = new URLSearchParams();
  if (next && next !== "/") {
    params.set("next", next);
  }
  const query = params.toString();
  return `${webEnv.apiBaseUrl}/auth/google/start${query ? `?${query}` : ""}`;
};

const genericGoogleError = "Chưa đăng nhập được bằng Google. Vui lòng thử lại.";

/** `/login?error=<code>` codes set by the API callback (BE google-oauth.ts `googleLoginErrors`). */
const googleErrorMessages = new Map<string, string>([
  [
    "google_not_allowed",
    "Email này chưa được phép đăng nhập bằng Google. Liên hệ quản trị viên để được thêm vào danh sách."
  ],
  ["google_account_disabled", "Tài khoản của bạn đang bị vô hiệu hóa. Liên hệ quản trị viên tổ chức."],
  [
    "google_account_conflict",
    "Email này đang gắn với một tài khoản khác. Liên hệ quản trị viên để được hỗ trợ."
  ],
  [
    "google_not_provisioned",
    "Tổ chức chưa sẵn sàng cho đăng nhập bằng Google. Liên hệ quản trị viên."
  ],
  ["google_email_unverified", "Email Google của bạn chưa được xác minh."],
  [
    "google_state_invalid",
    "Phiên đăng nhập Google đã hết hạn hoặc không hợp lệ. Vui lòng thử lại."
  ],
  ["google_cancelled", "Bạn đã hủy đăng nhập bằng Google."],
  ["google_unavailable", "Đăng nhập bằng Google hiện chưa được bật."],
  [
    "google_rate_limited",
    "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại."
  ],
  ["google_failed", genericGoogleError]
]);

/** Message for `?error=`; unknown codes get the generic Google message, no code → null. */
export const googleLoginErrorMessage = (code: string | null | undefined): string | null => {
  if (!code) {
    return null;
  }
  return googleErrorMessages.get(code) ?? genericGoogleError;
};
