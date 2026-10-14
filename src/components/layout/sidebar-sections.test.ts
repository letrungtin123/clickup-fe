// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  isSectionOpen,
  parseSectionState,
  retouchSectionDefaultOpen,
  setSidebarSectionOpen,
  sidebarSectionsKey
} from "./sidebar-sections";

afterEach(() => window.localStorage.clear());

describe("sidebar sections (P2)", () => {
  it("keeps only known sections with boolean values", () => {
    expect(parseSectionState(null)).toEqual({});
    expect(parseSectionState("not json")).toEqual({});
    expect(parseSectionState("[true]")).toEqual({});
    expect(parseSectionState('{"retouch":false,"projects":true,"x":false,"channels":"no"}')).toEqual({
      retouch: false,
      projects: true
    });
  });

  it("drops the old production section state (the Photo Retouch menu starts open again)", () => {
    expect(parseSectionState('{"production":false,"dms":false}')).toEqual({ dms: false });
  });

  it("opens Photo Retouch by default while that department is shown", () => {
    expect(retouchSectionDefaultOpen("PHOTO_RETOUCH")).toBe(true);
    expect(retouchSectionDefaultOpen("PRODUCTION")).toBe(false);
    expect(retouchSectionDefaultOpen(null)).toBe(false);
  });

  it("remembers a choice per user and falls back to the default otherwise", () => {
    setSidebarSectionOpen("user-a", "retouch", false);
    setSidebarSectionOpen("user-a", "channels", true);
    const stored = parseSectionState(window.localStorage.getItem(sidebarSectionsKey("user-a")));
    expect(stored).toEqual({ retouch: false, channels: true });
    expect(isSectionOpen(stored, "retouch", true)).toBe(false);
    expect(isSectionOpen(stored, "projects", true)).toBe(true);
    expect(window.localStorage.getItem(sidebarSectionsKey("user-b"))).toBeNull();
  });
});
