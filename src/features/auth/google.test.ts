import { describe, expect, it } from "vitest";

import { googleLoginErrorMessage, googleStartHref } from "./google";

describe("googleStartHref", () => {
  it("navigates to the API start endpoint, carrying the return path", () => {
    expect(googleStartHref("/")).toBe("/api/v1/auth/google/start");
    expect(googleStartHref("/p/1/l/2?task=3")).toBe(
      "/api/v1/auth/google/start?next=%2Fp%2F1%2Fl%2F2%3Ftask%3D3"
    );
  });
});

describe("googleLoginErrorMessage", () => {
  it("explains every callback error in Vietnamese", () => {
    expect(googleLoginErrorMessage("google_not_allowed")).toMatch(/chưa được phép/);
    expect(googleLoginErrorMessage("google_account_disabled")).toMatch(/vô hiệu hóa/);
    expect(googleLoginErrorMessage("google_state_invalid")).toMatch(/hết hạn/);
    expect(googleLoginErrorMessage("google_cancelled")).toMatch(/hủy/);
    expect(googleLoginErrorMessage("google_rate_limited")).toMatch(/quá nhiều lần/);
  });

  it("falls back to a generic message for unknown codes and ignores a missing one", () => {
    expect(googleLoginErrorMessage("server_error")).toBe(googleLoginErrorMessage("google_failed"));
    expect(googleLoginErrorMessage("__proto__")).toBe(googleLoginErrorMessage("google_failed"));
    expect(googleLoginErrorMessage(null)).toBeNull();
    expect(googleLoginErrorMessage("")).toBeNull();
  });
});
