import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { isRetryableUploadError } from "./errors";

describe("isRetryableUploadError (WK-51)", () => {
  it("offers a retry for transport and server failures only", () => {
    expect(isRetryableUploadError(new Error("Upload failed"))).toBe(true);
    expect(isRetryableUploadError(new ApiError({ status: 0, code: "NETWORK_ERROR", message: "x" }))).toBe(true);
    expect(isRetryableUploadError(new ApiError({ status: 503, code: "INTERNAL_SERVER_ERROR", message: "x" }))).toBe(true);
    expect(isRetryableUploadError(new ApiError({ status: 400, code: "CHAT_ATTACHMENT_TYPE_BLOCKED", message: "x" }))).toBe(false);
    expect(isRetryableUploadError(new ApiError({ status: 400, code: "CHAT_ATTACHMENT_TOO_LARGE", message: "x" }))).toBe(false);
  });
});
