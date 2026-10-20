// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobDetail } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { todayIn } from "../../format";
import { jobsApi } from "../../jobs-api";
import { productionKeys } from "../../keys";
import { JobFormDialog, leaderMissingError, leaderRequiredError } from "./job-form-dialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() })
}));

// PD-073 — the job form's Leader is required. Obviously fake ids and names (the repository is public).
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

const oldJob = (canChangeLeader: boolean) =>
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
    capabilities: { canEdit: true, canChangeLeader }
  }) as unknown as JobDetail;

const renderForm = (roles: string[], job: JobDetail | null = null) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } }
  });
  client.setQueryData(productionKeys.me(), {
    roles,
    isAdmin: false,
    teamId: null,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "all" },
    features: [],
    settings: { timezone: TZ }
  });
  client.setQueryData(productionKeys.members(), {
    items: [member(ME, roles), member(OTHER_LEADER, ["LEADER"])]
  });
  client.setQueryData(productionKeys.projects(), {
    items: [{ ...PROJECT, active: true, clientId: null }]
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
        <JobFormDialog
          open
          job={job}
          initial={{ projectId: PROJECT.id }}
          onClose={() => undefined}
        />
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
const pickLeader = async (name: string) => {
  await click(screen.getByRole("combobox", { name: "Leader phụ trách" }));
  const option = await screen.findByRole("option", { name: new RegExp(name) });
  await act(async () => {
    // A real mouse click starts on the item (Base UI ignores a bare click there).
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await Promise.resolve();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Tạo job — the Leader is required (PD-073)", () => {
  it("a creator holding LEADER starts with themselves as Leader; no “none” choice", async () => {
    const create = vi.spyOn(jobsApi, "create").mockResolvedValue(savedJob);
    renderForm(["LEADER"]);
    const leader = screen.getByRole("combobox", { name: "Leader phụ trách" });
    expect(leader.textContent).toContain(ME.displayName);
    // No "(tùy chọn)" on the Leader any more.
    expect(screen.getByText("Leader phụ trách", { selector: "label" }).textContent).toBe(
      "Leader phụ trách"
    );
    expect(screen.getByText("Mỗi job phải có một Leader phụ trách.")).toBeTruthy();
    await click(leader);
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).not.toContain("Chưa có leader");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    fireEvent.change(screen.getByLabelText("Gói công việc"), { target: { value: "Batch 1" } });
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
    expect(screen.getByRole("combobox", { name: "Leader phụ trách" }).textContent).toContain(
      "Chọn Leader"
    );
    fireEvent.change(screen.getByLabelText("Gói công việc"), { target: { value: "Batch 1" } });
    await click(screen.getByRole("button", { name: "Tạo job" }));
    expect(screen.getByText(leaderRequiredError)).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Leader phụ trách" }).getAttribute("aria-invalid")
    ).toBe("true");
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
    renderForm(["LEADER"], oldJob(true));
    expect(screen.getByRole("combobox", { name: "Leader phụ trách" }).textContent).toContain(
      "Chọn Leader"
    );
    expect(screen.getByText(leaderMissingError)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Gói công việc"), { target: { value: "Batch 2" } });
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
    const leader = screen.getByRole("combobox", { name: "Leader phụ trách" });
    expect(leader.textContent).toContain("Chưa có leader");
    expect(screen.queryByText(leaderMissingError)).toBeNull();
    expect(screen.getByText("Bạn không có quyền đổi Leader của job.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Gói công việc"), { target: { value: "Batch 2" } });
    await click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(update).toHaveBeenCalledWith(id(50), { code: "Batch 2" });
  });
});
