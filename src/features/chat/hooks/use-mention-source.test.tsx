// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isMentionAllCandidate, type MentionCandidate } from "@/components/shared/rich-text/mention-candidates";
import type { ChatChannel } from "@/contracts/chat";
import type { UserRef } from "@/contracts/work";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { chatApi } from "../api";
import { CHANNEL_ID, makeChannel, me } from "../model/test-fixtures";
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

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionValueContext value={session}>{children}</SessionValueContext>
);

const sourceFor = (channel: Pick<ChatChannel, "id" | "kind" | "memberCount">) =>
  renderHook(() => useMentionSource(channel), { wrapper }).result.current;

const people = (items: MentionCandidate[]) => items.filter((item) => !isMentionAllCandidate(item));

describe("useMentionSource (PD-053)", () => {
  it("asks for a full directory page and offers everyone but the viewer", async () => {
    const everyone = [me, ...Array.from({ length: 20 }, (_, index) => person(index + 1))];
    const directory = vi.spyOn(chatApi, "directory").mockResolvedValue({ items: everyone });

    const suggestions = await sourceFor(makeChannel({ kind: "dm", memberCount: 2 }))("");

    expect(mentionCandidateLimit).toBe(50);
    expect(directory).toHaveBeenCalledWith({ q: "", channelId: CHANNEL_ID, limit: 50 }, undefined);
    // Typing "@" used to list 7 people (a page of 8 minus yourself).
    expect(suggestions).toHaveLength(20);
    expect(suggestions.some((user) => user.id === me.id)).toBe(false);
  });
});

describe("useMentionSource — @all (PD-061)", () => {
  it("puts @all first in public / private channels on a bare @, with the member count", async () => {
    vi.spyOn(chatApi, "directory").mockResolvedValue({ items: [me, person(1), person(2)] });

    for (const kind of ["public", "private"] as const) {
      const suggestions = await sourceFor(makeChannel({ kind, memberCount: 12 }))("");
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]).toEqual({ kind: "all", id: "all", description: "Nhắc tất cả 12 thành viên trong kênh" });
      expect(people(suggestions).map((user) => user.id)).toEqual([person(1).id, person(2).id]);
    }
  });

  it("offers @all in group DMs (\"trong nhóm\") but never in a 1:1 DM", async () => {
    vi.spyOn(chatApi, "directory").mockResolvedValue({ items: [person(1)] });

    const group = await sourceFor(makeChannel({ kind: "group_dm", name: null, memberCount: 4 }))("");
    expect(group[0]).toEqual({ kind: "all", id: "all", description: "Nhắc tất cả 4 thành viên trong nhóm" });

    const direct = sourceFor(makeChannel({ kind: "dm", name: null, memberCount: 2 }));
    for (const query of ["", "all", "tất cả", "everyone"]) {
      expect((await direct(query)).some(isMentionAllCandidate)).toBe(false);
    }
  });

  it("matches \"all\", \"tất cả\", \"everyone\", \"kênh\" with or without diacritics, not people searches", async () => {
    vi.spyOn(chatApi, "directory").mockResolvedValue({ items: [] });
    const source = sourceFor(makeChannel({ kind: "public", memberCount: 30 }));

    for (const query of ["all", "ALL", "tat", "tất", "tatca", "TấtCả", "everyone", "eve", "kênh", "kenh", "KÊNH", "mọi"]) {
      const suggestions = await source(query);
      expect(suggestions[0] && isMentionAllCandidate(suggestions[0]), query).toBe(true);
    }
    for (const query of ["a", "ta", "an", "nh", "minh", "allen", "kenhx"]) {
      expect((await source(query)).some(isMentionAllCandidate), query).toBe(false);
    }
  });
});
