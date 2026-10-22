// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobDetail } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { todayIn } from "../../format";
import { jobsApi } from "../../jobs-api";
import { productionKeys } from "../../keys";
import { projectFixture } from "../../test-fixtures";
import {
  boundLeaderNote,
  boundMoveNote,
  JobFormDialog,
  leaderMissingError,
  leaderRequiredError,
  noOwnProjectNote
} from "./job-form-dialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() })
}));

// PD-073 (the Leader is required) and PD-078 (a Leader works in the Projects they own; an Admin's Leader is pre-filled
// with the Project's owner). Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";
const today = todayIn(TZ);
const user = (n: number, name: string) => ({
  id: id(n),
  displayName: name,
  email: null,
  avatarUrl: null
});
const ME = user(1, "Người Thử");
const OTHER_LEADER = user(2, "Leader Hai");
const THIRD_LEADER = user(3, "Leader Ba");
const ADMIN_ONLY = user(4, "Quản trị Bốn");
/** Mine (AXP), another Leader's (BRX), without owner (CAT), owned by an Admin without LEADER (DRX), mine but off (EXQ). */
const PROJECTS = [
  projectFixture({ id: id(40), code: "AXP", name: "Axon", owner: ME }),
  projectFixture({ id: id(41), code: "BRX", name: "Brix", owner: OTHER_LEADER }),
  projectFixture({ id: id(42), code: "CAT", name: "Cát" }),
  projectFixture({ id: id(43), code: "DRX", name: "Drix", owner: ADMIN_ONLY }),
  projectFixture({ id: id(44), code: "EXQ", name: "Exq", owner: ME, active: false })
];
const PROJECT = { id: id(40), code: "AXP", name: "Axon", clientName: null };

const member = (person: ReturnType<typeof user>, roles: string[]) => ({
  userId: person.id,
  displayName: person.displayName,
  email: null,
  avatarUrl: null,
  roles,
  teamId: null,
  active: true,
  customValues: {},
  tagIds: []
});

const savedJob = { id: id(50), code: "Batch 1" } as unknown as JobDetail;

const oldJob = (canChangeLeader: boolean, overrides: Partial<JobDetail> = {}) =>
  ({
    id: id(50),
    code: "Batch 1",
    name: null,
    project: PROJECT,
    leader: null,
    receivedAt: `${today}T00:00:00+07:00`,
    deadline: `${today}T23:59:00+07:00`,
    totalImages: 0,
    totalImagesManual: false,
    driveLink: null,
    customValues: {},
    tagIds: [],
    tasks: [],
    capabilities: { canEdit: true, canChangeLeader },
    ...overrides
  }) as unknown as JobDetail;

const renderForm = (
  roles: string[],
  job: JobDetail | null = null,
  options: { initialProjectId?: string | null; projects?: typeof PROJECTS } = {}
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } }
  });
  client.setQueryData(productionKeys.me(), {
    roles,
    isAdmin: roles.includes("ADMIN"),
    teamId: null,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "all" },
    features: [],
    settings: { timezone: TZ }
  });
  client.setQueryData(productionKeys.members(), {
    items: [
      member(ME, roles),
      member(OTHER_LEADER, ["LEADER"]),
      member(THIRD_LEADER, ["LEADER"]),
      member(ADMIN_ONLY, ["ADMIN"])
    ]
  });
  client.setQueryData(productionKeys.projects(), {
    items: options.projects ?? PROJECTS,
    canCreate: true
  });
  client.setQueryData(productionKeys.jobStatuses(), { items: [] });
  client.setQueryData(productionKeys.tags(), { items: [] });
  client.setQueryData(productionKeys.customFields(), { items: [] });
  const session = {
    user: { id: ME.id, displayName: ME.displayName, email: "viewer@example.test", avatarUrl: null },
    productionRoles: roles
  } as unknown as SessionContext;
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter>
          <JobFormDialog
            open
            job={job}
            initial={{
              projectId:
                options.initialProjectId === undefined ? PROJECT.id : options.initialProjectId
            }}
            onClose={() => undefined}
          />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

const click = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
};
const pick = async (combobox: string, name: string) => {
  await click(screen.getByRole("combobox", { name: combobox }));
  const option = await screen.findByRole("option", { name: new RegExp(name) });
  await act(async () => {
    // A real mouse click starts on the item (Base UI ignores a bare click there).
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await Promise.resolve();
  });
};
const pickLeader = (name: string) => pick("Leader phụ trách", name);
const leaderBox = () => screen.getByRole("combobox", { name: "Leader phụ trách" });
const projectBox = () => screen.getByRole("combobox", { name: "Project" });
const optionsOf = async (combobox: HTMLElement) => {
  await click(combobox);
  const names = (await screen.findAllByRole("option")).map((option) => option.textContent);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  return names;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Tạo job — the Leader is required (PD-073)", () => {
  it("a creator holding LEADER (and Account) starts with themselves as Leader; no “none” choice", async () => {
    const create = vi.spyOn(jobsApi, "create").mockResolvedValue(savedJob);
    renderForm(["LEADER", "ACCOUNT"]);
    expect(leaderBox().textContent).toContain(ME.displayName);
    // No "(tùy chọn)" on the Leader any more.
    expect(screen.getByText("Leader phụ trách", { selector: "label" }).textContent).toBe(
      "Leader phụ trách"
    );
    // PD-079: the Project's owner (me) is the pre-filled Leader.
    expect(screen.getByText("Mặc định là người phụ trách Project — có thể đổi.")).toBeTruthy();
    expect(await optionsOf(leaderBox())).not.toContain("Chưa có leader");

    fireEvent.change(screen.getByLabelText("Job Code"), { target: { value: "Batch 1" } });
    await click(screen.getByRole("button", { name: "Tạo job" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({
      projectId: PROJECT.id,
      code: "Batch 1",
      leaderId: ME.id
    });
  });

  it("anyone else must pick one: the inline error, nothing sent until then", async () => {
    const create = vi.spyOn(jobsApi, "create").mockResolvedValue(savedJob);
    renderForm(["ACCOUNT"]);
    expect(leaderBox().textContent).toContain("Chọn Leader");
    fireEvent.change(screen.getByLabelText("Job Code"), { target: { value: "Batch 1" } });
    await click(screen.getByRole("button", { name: "Tạo job" }));
    expect(screen.getByText(leaderRequiredError)).toBeTruthy();
    expect(leaderBox().getAttribute("aria-invalid")).toBe("true");
    expect(create).not.toHaveBeenCalled();

    await pickLeader(OTHER_LEADER.displayName);
    expect(screen.queryByText(leaderRequiredError)).toBeNull();
    await click(screen.getByRole("button", { name: "Tạo job" }));
    expect(create.mock.calls[0]![0]).toMatchObject({ leaderId: OTHER_LEADER.id });
  });
});

describe("Sửa job — an older job without a leader (PD-073)", () => {
  it("nothing pre-selected, the field's error at once; saving needs a Leader", async () => {
    const update = vi.spyOn(jobsApi, "update").mockResolvedValue(savedJob);
    renderForm(["LEADER", "ACCOUNT"], oldJob(true));
    expect(leaderBox().textContent).toContain("Chọn Leader");
    expect(screen.getByText(leaderMissingError)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Job Code"), { target: { value: "Batch 2" } });
    await click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(screen.getByText(leaderRequiredError)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();

    await pickLeader(OTHER_LEADER.displayName);
    await click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(update).toHaveBeenCalledWith(id(50), { code: "Batch 2", leaderId: OTHER_LEADER.id });
  });

  it("without the right to change the Leader: read-only, not required (the API lets the edit through)", async () => {
    const update = vi.spyOn(jobsApi, "update").mockResolvedValue(savedJob);
    renderForm(["STAFF", "QC"], oldJob(false));
    expect(leaderBox().textContent).toContain("Chưa có leader");
    expect(screen.queryByText(leaderMissingError)).toBeNull();
    expect(screen.getByText("Bạn không có quyền đổi Leader của job.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Job Code"), { target: { value: "Batch 2" } });
    await click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(update).toHaveBeenCalledWith(id(50), { code: "Batch 2" });
  });
});

describe("PD-078 — a Leader works in the Projects they own", () => {
  it("a Leader (no Admin / Account): only their active Projects, always their own Leader (locked)", async () => {
    const create = vi.spyOn(jobsApi, "create").mockResolvedValue(savedJob);
    renderForm(["LEADER", "QC"]);
    expect(projectBox().textContent).toContain("AXP");
    expect(await optionsOf(projectBox())).toEqual([expect.stringMatching(/^AXP · Axon/)]);
    expect(screen.getByText("Chỉ các Project do bạn phụ trách.")).toBeTruthy();
    expect(leaderBox().textContent).toContain(ME.displayName);
    expect(
      leaderBox().hasAttribute("disabled") || leaderBox().getAttribute("data-disabled") !== null
    ).toBe(true);
    expect(screen.getByText(boundLeaderNote)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Job Code"), { target: { value: "Batch 1" } });
    await click(screen.getByRole("button", { name: "Tạo job" }));
    expect(create.mock.calls[0]![0]).toMatchObject({ projectId: PROJECT.id, leaderId: ME.id });
  });

  it("the list's Project of someone else is dropped; with no Project of their own the form says so", async () => {
    const create = vi.spyOn(jobsApi, "create").mockResolvedValue(savedJob);
    renderForm(["LEADER"], null, { initialProjectId: id(41) });
    expect(projectBox().textContent).toContain("Chọn Project");
    fireEvent.change(screen.getByLabelText("Job Code"), { target: { value: "Batch 1" } });
    await click(screen.getByRole("button", { name: "Tạo job" }));
    expect(screen.getByText("Chọn Project.")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    cleanup();

    renderForm(["LEADER"], null, {
      projects: PROJECTS.filter((project) => project.owner?.id !== ME.id)
    });
    expect(screen.getByText(new RegExp(noOwnProjectNote))).toBeTruthy();
    expect(screen.getByRole("link", { name: "Mở trang Project" })).toBeTruthy();
  });

  it("editing: a job of someone else's Project cannot move; the Leader can only become themselves", async () => {
    const update = vi.spyOn(jobsApi, "update").mockResolvedValue(savedJob);
    const brix = { id: id(41), code: "BRX", name: "Brix", clientName: null };
    renderForm(["LEADER"], oldJob(true, { project: brix, leader: OTHER_LEADER }));
    expect(screen.getByText(boundMoveNote)).toBeTruthy();
    expect(
      projectBox().hasAttribute("disabled") || projectBox().getAttribute("data-disabled") !== null
    ).toBe(true);
    expect(await optionsOf(leaderBox())).toEqual([
      expect.stringContaining(OTHER_LEADER.displayName),
      expect.stringContaining(ME.displayName)
    ]);
    expect(screen.getByText("Leader chỉ đặt được chính mình làm Leader của job.")).toBeTruthy();
    await pickLeader(ME.displayName);
    await click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(update).toHaveBeenCalledWith(id(50), { leaderId: ME.id });
  });

  it("editing a job of their own Project: moves only to another Project of theirs", async () => {
    renderForm(["LEADER"], oldJob(true, { leader: ME }), {
      projects: [...PROJECTS, projectFixture({ id: id(45), code: "FAX", name: "Fax", owner: ME })]
    });
    expect(screen.queryByText(boundMoveNote)).toBeNull();
    expect(await optionsOf(projectBox())).toEqual([
      expect.stringMatching(/^AXP/),
      expect.stringMatching(/^FAX/)
    ]);
  });
});

describe("PD-078 — an Admin's Leader is pre-filled with the Project's owner", () => {
  it("picked Project → its owner (when they hold LEADER), changeable; a manual choice sticks", async () => {
    const create = vi.spyOn(jobsApi, "create").mockResolvedValue(savedJob);
    renderForm(["ADMIN"], null, { initialProjectId: id(41) });
    // Any Project for an Admin.
    expect((await optionsOf(projectBox())).length).toBe(4);
    expect(leaderBox().textContent).toContain(OTHER_LEADER.displayName);
    expect(screen.getByText("Mặc định là người phụ trách Project — có thể đổi.")).toBeTruthy();
    // No owner, or an owner without LEADER (Admin only, cannot lead a job): nothing pre-filled.
    await pick("Project", "CAT");
    expect(leaderBox().textContent).toContain("Chọn Leader");
    await pick("Project", "DRX");
    expect(leaderBox().textContent).toContain("Chọn Leader");
    await pick("Project", "BRX");
    expect(leaderBox().textContent).toContain(OTHER_LEADER.displayName);
    // A manual choice stays when the Project changes.
    await pickLeader(THIRD_LEADER.displayName);
    await pick("Project", "CAT");
    expect(leaderBox().textContent).toContain(THIRD_LEADER.displayName);
    await pick("Project", "BRX");
    fireEvent.change(screen.getByLabelText("Job Code"), { target: { value: "Batch 1" } });
    await click(screen.getByRole("button", { name: "Tạo job" }));
    expect(create.mock.calls[0]![0]).toMatchObject({
      projectId: id(41),
      leaderId: THIRD_LEADER.id
    });
  });

  it("PD-079: an Account is pre-filled with the Project's first owner holding LEADER too", () => {
    renderForm(["ACCOUNT"], null, { initialProjectId: id(41) });
    expect(leaderBox().textContent).toContain(OTHER_LEADER.displayName);
    expect(screen.getByText("Mặc định là người phụ trách Project — có thể đổi.")).toBeTruthy();
  });
});

describe("PD-079 — several owners", () => {
  /** Owners in order: an Admin without LEADER (cannot lead a job), then two Leaders. */
  const multi = projectFixture({ id: id(46), code: "GRX", name: "Grx", owners: [ADMIN_ONLY, THIRD_LEADER, OTHER_LEADER] });

  it("Admin / Account: the owners holding LEADER come first in the picker (marked), the first one pre-filled", async () => {
    for (const roles of [["ADMIN"], ["ACCOUNT"]]) {
      renderForm(roles, null, { initialProjectId: multi.id, projects: [...PROJECTS, multi] });
      expect(leaderBox().textContent).toContain(THIRD_LEADER.displayName);
      const options = await optionsOf(leaderBox());
      expect(options[0]).toContain(THIRD_LEADER.displayName);
      expect(options[0]).toContain("phụ trách Project");
      expect(options[1]).toContain(OTHER_LEADER.displayName);
      expect(options[1]).toContain("phụ trách Project");
      cleanup();
    }
  });

  it("a Leader who is one of several owners creates jobs there, led by themselves", async () => {
    const create = vi.spyOn(jobsApi, "create").mockResolvedValue(savedJob);
    const coOwned = projectFixture({ id: id(47), code: "HRX", name: "Hrx", owners: [OTHER_LEADER, ME] });
    renderForm(["LEADER"], null, { initialProjectId: coOwned.id, projects: [...PROJECTS, coOwned] });
    expect(projectBox().textContent).toContain("HRX");
    expect(leaderBox().textContent).toContain(ME.displayName);
    fireEvent.change(screen.getByLabelText("Job Code"), { target: { value: "Batch 1" } });
    await click(screen.getByRole("button", { name: "Tạo job" }));
    expect(create.mock.calls[0]![0]).toMatchObject({ projectId: coOwned.id, leaderId: ME.id });
  });
});
