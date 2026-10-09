import { describe, expect, it } from "vitest";

import { ApiClientError } from "./api-client.js";

describe("ApiClientError", () => {
  it("keeps status code for safe UI handling", () => {
    const error = new ApiClientError("Failed", 503);

    expect(error.statusCode).toBe(503);
    expect(error.message).toBe("Failed");
  });
});

