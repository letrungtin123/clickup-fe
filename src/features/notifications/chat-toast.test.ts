import { describe, expect, it } from "vitest";

import { chatToastId, chatToastTitle } from "./chat-toast";

describe("chat toasts", () => {
  it("keeps one card per conversation", () => {
    expect(chatToastId("c1")).toBe("chat:c1");
    expect(chatToastId("c1")).toBe(chatToastId("c1"));
    expect(chatToastId("c1")).not.toBe(chatToastId("c2"));
  });

  it("counts a burst of messages in the title", () => {
    expect(chatToastTitle("An · #thiet-ke", 1)).toBe("An · #thiet-ke");
    expect(chatToastTitle("An · #thiet-ke", 3)).toBe("An · #thiet-ke · 3 tin mới");
  });
});
