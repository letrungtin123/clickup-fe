import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { chatErrorMessage, isRetryableUploadError } from "./errors";

describe("chatErrorMessage — public channel departments (PD-053)", () => {
  it("explains the department errors in Vietnamese", () => {
    expect(
      chatErrorMessage(new ApiError({ status: 400, code: "CHANNEL_DEPARTMENT_REQUIRED", message: "x" }))
    ).toBe("Kênh cần thuộc một phòng ban. Chọn phòng ban trên thanh trên cùng rồi thử lại.");
    expect(chatErrorMessage(new ApiError({ status: 403, code: "DEPARTMENT_FORBIDDEN", message: "x" }))).toBe(
      "Bạn không thuộc phòng ban này."
    );
  });
});

describe("isRetryableUploadError (WK-51)", () => {
  it("offers a retry for transport and server failures only", () => {
    expect(isRetryableUploadError(new Error("Upload failed"))).toBe(true);
    expect(isRetryableUploadError(new ApiError({ status: 0, code: "NETWORK_ERROR", message: "x" }))).toBe(true);
    expect(isRetryableUploadError(new ApiError({ status: 503, code: "INTERNAL_SERVER_ERROR", message: "x" }))).toBe(true);
    expect(isRetryableUploadError(new ApiError({ status: 400, code: "CHAT_ATTACHMENT_TYPE_BLOCKED", message: "x" }))).toBe(false);
    expect(isRetryableUploadError(new ApiError({ status: 400, code: "CHAT_ATTACHMENT_TOO_LARGE", message: "x" }))).toBe(false);
  });
});
