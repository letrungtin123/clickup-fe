// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  isSectionOpen,
  parseSectionState,
  productionSectionDefaultOpen,
  setSidebarSectionOpen,
  sidebarSectionsKey
} from "./sidebar-sections";

afterEach(() => window.localStorage.clear());

describe("sidebar sections (P2)", () => {
  it("keeps only known sections with boolean values", () => {
    expect(parseSectionState(null)).toEqual({});
    expect(parseSectionState("not json")).toEqual({});
    expect(parseSectionState("[true]")).toEqual({});
    expect(parseSectionState('{"production":false,"projects":true,"x":false,"channels":"no"}')).toEqual({
      production: false,
      projects: true
    });
  });

  it("opens Sản xuất by default only for people holding a production role", () => {
    expect(productionSectionDefaultOpen(["STAFF"])).toBe(true);
    expect(productionSectionDefaultOpen(["LEADER", "QC"])).toBe(true);
    expect(productionSectionDefaultOpen([])).toBe(false);
  });

  it("remembers a choice per user and falls back to the default otherwise", () => {
    setSidebarSectionOpen("user-a", "production", false);
    setSidebarSectionOpen("user-a", "channels", true);
    const stored = parseSectionState(window.localStorage.getItem(sidebarSectionsKey("user-a")));
    expect(stored).toEqual({ production: false, channels: true });
    expect(isSectionOpen(stored, "production", true)).toBe(false);
    expect(isSectionOpen(stored, "projects", true)).toBe(true);
    expect(window.localStorage.getItem(sidebarSectionsKey("user-b"))).toBeNull();
  });
});
