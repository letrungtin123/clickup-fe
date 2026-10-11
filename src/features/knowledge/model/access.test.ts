import { describe, expect, it } from "vitest";

import type { KnowledgeSpaceCapabilities, KnowledgeStatus } from "@/contracts/knowledge";

import {
  approvalLocked,
  canCreateSpace,
  canSeeKnowledge,
  createStatusChoices,
  isRetired,
  isValidReason,
  itemActions,
  reasonRequired,
  spaceUi,
  statusChoices
} from "./access";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

const caps = (overrides: Partial<KnowledgeSpaceCapabilities> = {}): KnowledgeSpaceCapabilities => ({
  canRead: true,
  canComment: true,
  canEdit: false,
  canManage: false,
  canViewAudit: false,
  canPurge: false,
  canUpdate: false,
  canManageMembers: false,
  canArchive: false,
  ...overrides
});

const org = { view: true, create: false, delete: false };

const statuses: KnowledgeStatus[] = [
  { id: id(1), name: "Nháp", color: "gray", group: "draft", position: 0 },
  { id: id(2), name: "Chờ duyệt", color: "amber", group: "draft", position: 1 },
  { id: id(3), name: "Đã ban hành", color: "green", group: "active", position: 2 },
  { id: id(4), name: "Hết hiệu lực", color: "red", group: "retired", position: 3 }
];

describe("org permission layer", () => {
  it("hides the section without knowledge.view and creating without knowledge.create", () => {
    expect(canSeeKnowledge({ view: false, create: true, delete: true })).toBe(false);
    expect(canCreateSpace({ view: false, create: true, delete: false })).toBe(false);
    expect(canCreateSpace({ view: true, create: false, delete: false })).toBe(false);
    expect(canCreateSpace({ view: true, create: true, delete: false })).toBe(true);
  });
});

describe("spaceUi", () => {
  it("gives readers of a public space comments only", () => {
    expect(spaceUi({ capabilities: caps(), archivedAt: null }, org)).toEqual({
      canCreateItem: false,
      canManageCategories: false,
      canManage: false,
      canUpdate: false,
      canManageMembers: false,
      canArchive: false,
      canViewAudit: false,
      canViewTrash: false,
      canPurge: false,
      canComment: true,
      readOnly: false
    });
  });

  it("lets members (submit) create items and see the trash", () => {
    const ui = spaceUi({ capabilities: caps({ canEdit: true }), archivedAt: null }, org);
    expect(ui.canCreateItem).toBe(true);
    expect(ui.canViewTrash).toBe(true);
    expect(ui.canManage).toBe(false);
  });

  it("needs both manage capability and knowledge.delete to purge", () => {
    const manager = caps({ canEdit: true, canManage: true, canViewAudit: true, canPurge: true });
    expect(spaceUi({ capabilities: manager, archivedAt: null }, org).canPurge).toBe(false);
    expect(spaceUi({ capabilities: manager, archivedAt: null }, { ...org, delete: true }).canPurge).toBe(true);
    expect(spaceUi({ capabilities: { ...manager, canPurge: false }, archivedAt: null }, { ...org, delete: true }).canPurge).toBe(false);
  });

  it("makes an archived space read-only but keeps its audit log", () => {
    const ui = spaceUi(
      { capabilities: caps({ canEdit: true, canManage: true, canViewAudit: true, canPurge: true }), archivedAt: "2026-10-01T00:00:00Z" },
      { ...org, delete: true }
    );
    expect(ui).toMatchObject({ readOnly: true, canCreateItem: false, canManage: false, canPurge: false, canComment: false, canViewAudit: true });
  });

  it("splits manager rights by the org permissions (update / members / archive)", () => {
    const ui = spaceUi(
      { capabilities: caps({ canEdit: true, canManage: true, canUpdate: false, canManageMembers: true, canArchive: false }), archivedAt: null },
      org
    );
    expect(ui).toMatchObject({ canManage: true, canUpdate: false, canManageCategories: false, canManageMembers: true, canArchive: false });
    const archived = spaceUi({ capabilities: caps({ canManage: true, canArchive: true, canUpdate: true }), archivedAt: "2026-10-01T00:00:00Z" }, org);
    expect(archived).toMatchObject({ canArchive: true, canUpdate: false });
  });
});

describe("status choices", () => {
  it("offers only allowed statuses other than the current one, in space order", () => {
    const item = {
      status: statuses[0] as KnowledgeStatus,
      capabilities: {
        canEdit: true,
        canChangeStatus: true,
        allowedStatusIds: [id(4), id(2), id(1)],
        canDelete: true,
        canComment: true,
        canViewHistory: true
      }
    };
    expect(statusChoices(statuses, item).map((status) => status.name)).toEqual(["Chờ duyệt", "Hết hiệu lực"]);
    expect(statusChoices(statuses, { ...item, capabilities: { ...item.capabilities, canChangeStatus: false } })).toEqual([]);
  });

  it("offers only draft statuses on create when approval is on and the caller is not a manager", () => {
    const member = { approvalRequired: true, capabilities: caps({ canEdit: true }) };
    expect(createStatusChoices(statuses, member).map((status) => status.group)).toEqual(["draft", "draft"]);
    expect(createStatusChoices(statuses, { ...member, approvalRequired: false })).toHaveLength(4);
    expect(createStatusChoices(statuses, { approvalRequired: true, capabilities: caps({ canManage: true }) })).toHaveLength(4);
  });
});

describe("reasons and item rules", () => {
  it("requires a reason when the item is or becomes critical", () => {
    expect(reasonRequired("critical")).toBe(true);
    expect(reasonRequired("normal", "critical")).toBe(true);
    expect(reasonRequired("important", "normal")).toBe(false);
    expect(isValidReason("  ab ")).toBe(false);
    expect(isValidReason("Sửa bước 3")).toBe(true);
  });

  it("explains the approval lock to members on published items only", () => {
    const capabilities = { canEdit: false, canChangeStatus: false, allowedStatusIds: [], canDelete: false, canComment: true, canViewHistory: true };
    const member = { approvalRequired: true, capabilities: caps({ canEdit: true }) };
    const active = statuses[2] as KnowledgeStatus;
    expect(approvalLocked({ capabilities, status: active, deletedAt: null }, member)).toBe(true);
    expect(approvalLocked({ capabilities, status: statuses[0] as KnowledgeStatus, deletedAt: null }, member)).toBe(false);
    expect(approvalLocked({ capabilities, status: active, deletedAt: null }, { ...member, approvalRequired: false })).toBe(false);
    expect(approvalLocked({ capabilities, status: active, deletedAt: null }, { approvalRequired: true, capabilities: caps() })).toBe(false);
    expect(approvalLocked({ capabilities: { ...capabilities, canEdit: true }, status: active, deletedAt: null }, member)).toBe(false);
  });

  it("flags retired items and gates actions on deletion / archive", () => {
    expect(isRetired({ status: { group: "retired" } })).toBe(true);
    const capabilities = { canEdit: true, canChangeStatus: true, allowedStatusIds: [id(1)], canDelete: true, canComment: true, canViewHistory: true };
    expect(itemActions({ capabilities, deletedAt: null }, { archivedAt: null })).toMatchObject({ edit: true, changeStatus: true, delete: true });
    expect(itemActions({ capabilities, deletedAt: "2026-10-10T00:00:00Z" }, { archivedAt: null })).toMatchObject({ edit: false, delete: false, history: true });
    expect(itemActions({ capabilities: { ...capabilities, allowedStatusIds: [] }, deletedAt: null }, { archivedAt: null }).changeStatus).toBe(false);
  });
});
