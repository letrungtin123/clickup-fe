// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UserRef } from "@/contracts/work";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { chatApi } from "../api";
import { CHANNEL_ID, me } from "../model/test-fixtures";
import { mentionCandidateLimit, useMentionSource } from "./use-mention-source";

const session = {
  user: { id: me.id, displayName: me.displayName, email: me.email },
  organization: { id: "org", name: "Org" },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  mustChangePassword: false
} as unknown as SessionContext;

// Obviously fake people (the repository is public).
const person = (n: number): UserRef => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  displayName: `Người ${n}`,
  email: null,
  avatarUrl: null
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useMentionSource (PD-053)", () => {
  it("asks for a full directory page and offers everyone but the viewer", async () => {
    const people = [me, ...Array.from({ length: 20 }, (_, index) => person(index + 1))];
    const directory = vi.spyOn(chatApi, "directory").mockResolvedValue({ items: people });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionValueContext value={session}>{children}</SessionValueContext>
    );
    const { result } = renderHook(() => useMentionSource(CHANNEL_ID), { wrapper });

    const suggestions = await result.current("");

    expect(mentionCandidateLimit).toBe(50);
    expect(directory).toHaveBeenCalledWith({ q: "", channelId: CHANNEL_ID, limit: 50 }, undefined);
    // Typing "@" used to list 7 people (a page of 8 minus yourself).
    expect(suggestions).toHaveLength(20);
    expect(suggestions.some((user) => user.id === me.id)).toBe(false);
  });
});
