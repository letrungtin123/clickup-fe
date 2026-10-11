import { cn } from "cn";
import { FilterX, IdCard, Lock, UserCheck, UserPlus, UsersRound } from "lucide-react";
import { useCallback, useId, useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  productionRoleCodes,
  type CustomField,
  type CustomValues,
  type ProductionMember,
  type ProductionRole
} from "@/contracts/production-catalog";
import type { LedJob } from "@/contracts/users-admin";
import { useSessionContext } from "@/features/auth/hooks";
import { matchesQuery } from "@/features/production/catalog";
import {
  CustomFieldsForm,
  CustomFieldValue
} from "@/features/production/components/custom-field-input";
import {
  CustomFieldChips,
  ListFiltersControl
} from "@/features/production/components/list-filters";
import { CreateMemberDialog } from "@/features/production/components/members/create-member-dialog";
import {
  MemberAccountConfirm,
  MemberActionsMenu,
  type AccountRequest,
  type MemberAction
} from "@/features/production/components/members/member-actions";
import {
  addOrphanNotice,
  orphanTitle,
  type OrphanNotice,
  type TemporarySecret
} from "@/features/production/components/members/member-admin";
import {
  LedJobsDialog,
  OrphanedJobsPanel
} from "@/features/production/components/members/orphaned-jobs";
import { TemporaryPasswordDialog } from "@/features/production/components/members/temporary-password-dialog";
import { useMemberLocks } from "@/features/production/components/members/use-member-locks";
import { RoleBadges, RoleToggleGroup } from "@/features/production/components/role-chips";
import {
  CountLabel,
  FormAlert,
  PageIntro,
  RowsSkeleton,
  SearchField,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { TagPicker } from "@/features/production/components/tag-picker";
import { toCustomValuesPayload, validateCustomValues } from "@/features/production/custom-fields";
import { productionErrorMessage, toastProductionError } from "@/features/production/errors";
import { todayIn } from "@/features/production/format";
import {
  useProductionAccess,
  useProductionMe,
  useProductionMembers,
  useSetProductionUserActive,
  useTeams,
  useUpdateMember
} from "@/features/production/hooks";
import { emptyListFilters } from "@/features/production/list-filters";
import { useUrlListFilters } from "@/features/production/list-filters-hooks";
import type { AccountLock } from "@/features/production/org-admins";
import { productionRoleColors, productionRoleLabels } from "@/features/production/roles";
import type { Tag, Team } from "@/features/production/types";
import { sheetOnPhone } from "@/features/production/ui";
import { toneClass } from "@/lib/colors";

const ALL = "__all__";
const NONE = "__none__";
const PAGE = 100;
const noQuery = {};

type RoleFilter = typeof ALL | typeof NONE | ProductionRole;

/** Still leads after the change: a stale "N job vẫn do … dẫn" warning about them can go. */
const leadsAgain = (member: ProductionMember) =>
  member.active && (member.roles.includes("LEADER") || member.roles.includes("ADMIN"));

/**
 * Production members (PD-011) and production user administration (SPEC Phase 0 /admin/users,
 * PD-024): the Admin creates accounts, grants production roles (multi-valued), a report team, USER
 * custom fields and tags, disables / re-enables accounts and resets passwords. Tag and custom-field
 * filters (Admin only) live in the URL.
 */
export const ProductionMembersRoute = () => {
  const access = useProductionAccess();
  const me = useProductionMe();
  const listFilters = useUrlListFilters("USER");
  // A shared link's `cf.*` / `tag` values are checked against the field catalog first (a stale one
  // is dropped instead of answering 400): `ready` waits for the catalog when the URL carries filters.
  const members = useProductionMembers(
    listFilters.ready,
    access.isAdmin ? listFilters.query : noQuery
  );
  const teams = useTeams();
  const locksFor = useMemberLocks();
  const setActive = useSetProductionUserActive();
  const [term, setTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(ALL);
  const [teamFilter, setTeamFilter] = useState<string>(ALL);
  const [limit, setLimit] = useState(PAGE);
  const [profileOf, setProfileOf] = useState<ProductionMember | null>(null);
  const [creating, setCreating] = useState(false);
  // A fresh form for every opening of "Thêm thành viên".
  const [createKey, setCreateKey] = useState(0);
  const [secret, setSecret] = useState<TemporarySecret | null>(null);
  const [request, setRequest] = useState<AccountRequest | null>(null);
  const [ledOf, setLedOf] = useState<ProductionMember | null>(null);
  const [orphans, setOrphans] = useState<OrphanNotice[]>([]);

  const items = useMemo(() => members.data?.items ?? [], [members.data]);
  const teamList = useMemo(() => teams.data?.items ?? [], [teams.data]);
  const tagList = listFilters.tags;
  const userFields = listFilters.fields;
  const columns = userFields.filter((field) => field.showInTable);
  const today = me.data ? todayIn(me.data.settings.timezone) : undefined;

  const roleCounts = useMemo(() => {
    const counts = new Map<RoleFilter, number>([
      [ALL, items.length],
      [NONE, 0]
    ]);
    for (const member of items) {
      if (member.roles.length === 0) counts.set(NONE, (counts.get(NONE) ?? 0) + 1);
      for (const role of member.roles) counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const rows = useMemo(
    () =>
      items.filter(
        (member) =>
          matchesQuery(term, member.displayName, member.email) &&
          (roleFilter === ALL ||
            (roleFilter === NONE
              ? member.roles.length === 0
              : member.roles.includes(roleFilter))) &&
          (teamFilter === ALL ||
            (teamFilter === NONE ? member.teamId === null : member.teamId === teamFilter))
      ),
    [items, term, roleFilter, teamFilter]
  );
  const visible = rows.slice(0, limit);
  const filtering =
    term.trim() !== "" || roleFilter !== ALL || teamFilter !== ALL || listFilters.count > 0;
  const teamItems = [
    { value: ALL, label: "Mọi team" },
    { value: NONE, label: "Chưa có team" },
    ...teamList.map((team) => ({
      value: team.id,
      label: team.active ? team.name : `${team.name} (lưu trữ)`
    }))
  ];
  const template = [
    "minmax(14rem,1.4fr)",
    "minmax(19rem,auto)",
    "11rem",
    "minmax(10rem,1fr)",
    ...columns.map(() => "minmax(8rem,1fr)"),
    "4.75rem"
  ].join(" ");

  const filterChips: { value: RoleFilter; label: string }[] = [
    { value: ALL, label: "Tất cả" },
    ...productionRoleCodes.map((role) => ({ value: role, label: productionRoleLabels[role] })),
    { value: NONE, label: "Chưa có vai trò" }
  ];

  const clearFilters = () => {
    setTerm("");
    setRoleFilter(ALL);
    setTeamFilter(ALL);
    setLimit(PAGE);
    listFilters.setFilters(emptyListFilters);
  };

  const dismissNotice = useCallback(
    (userId: string) => setOrphans((current) => current.filter((item) => item.userId !== userId)),
    []
  );

  /** SEC2-04: jobs still led after a role change / deactivation → inline warning (+ a toast). */
  const afterAccountChange = useCallback(
    (member: ProductionMember, jobs: readonly LedJob[], reason: OrphanNotice["reason"]) => {
      if (jobs.length === 0) {
        if (leadsAgain(member)) dismissNotice(member.userId);
        return;
      }
      setOrphans((current) =>
        addOrphanNotice(current, {
          userId: member.userId,
          displayName: member.displayName,
          reason,
          jobs: [...jobs]
        })
      );
      toast.warning(orphanTitle(jobs.length, member.displayName), {
        action: {
          label: "Xem",
          onClick: () =>
            document
              .querySelector(`[data-orphan-notice="${member.userId}"]`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      });
    },
    [dismissNotice]
  );

  const activate = (member: ProductionMember) =>
    setActive.mutate(
      { userId: member.userId, active: true },
      {
        onSuccess: (result) => {
          toast.success(`Đã kích hoạt lại tài khoản của ${member.displayName}`);
          if (leadsAgain(result.member)) dismissNotice(member.userId);
        },
        onError: (error) => toastProductionError(error)
      }
    );

  const runAction = (member: ProductionMember, action: MemberAction) => {
    if (action === "led-jobs") setLedOf(member);
    else if (action === "activate") activate(member);
    else setRequest({ kind: action, member });
  };

  const listError = members.isError ? members.error : null;

  return (
    <SettingsPage>
      <PageIntro
        slug="members"
        actions={
          <Button
            onClick={() => {
              setCreateKey((value) => value + 1);
              setCreating(true);
            }}
          >
            <UserPlus />
            Thêm thành viên
          </Button>
        }
      >
        Tạo tài khoản, gán vai trò sản xuất (một người có thể giữ nhiều vai trò), team báo cáo,
        trường tùy chỉnh và tag; vô hiệu hóa hoặc đặt lại mật khẩu khi cần.
      </PageIntro>

      <OrphanedJobsPanel notices={orphans} onDismiss={dismissNotice} />

      <div
        role="radiogroup"
        aria-label="Lọc theo vai trò"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:flex-wrap md:px-0"
      >
        {filterChips.map((chip) => {
          const checked = roleFilter === chip.value;
          const color =
            chip.value !== ALL && chip.value !== NONE ? productionRoleColors[chip.value] : "gray";
          return (
            <button
              key={chip.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                setRoleFilter(chip.value);
                setLimit(PAGE);
              }}
              className={cn(
                toneClass(color),
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring max-sm:h-10",
                checked
                  ? "border-transparent bg-(--tone-soft) text-(--tone-text)"
                  : "bg-surface text-foreground-muted hover:text-foreground"
              )}
            >
              {chip.label}
              <span className="tabular-nums opacity-70">{roleCounts.get(chip.value) ?? 0}</span>
            </button>
          );
        })}
      </div>

      <SettingsSection>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <SearchField
            value={term}
            onChange={(value) => {
              setTerm(value);
              setLimit(PAGE);
            }}
            placeholder="Tìm theo tên hoặc email"
            label="Tìm thành viên"
            className="max-sm:basis-full sm:min-w-52"
          />
          <Select
            items={teamItems}
            value={teamFilter}
            onValueChange={(value: string | null) => {
              setTeamFilter(value ?? ALL);
              setLimit(PAGE);
            }}
          >
            <SelectTrigger
              className="min-w-0 flex-1 basis-36 sm:w-48 sm:flex-none sm:basis-auto"
              aria-label="Lọc theo team"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teamItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Tag / USER custom-field filters: Admin data (403 CUSTOM_FIELDS_FORBIDDEN otherwise). */}
          {access.isAdmin ? (
            <ListFiltersControl
              title="Lọc thành viên theo trường và tag"
              fields={userFields}
              tags={tagList}
              filters={listFilters.filters}
              onChange={(next) => {
                listFilters.setFilters(next);
                setLimit(PAGE);
              }}
              today={today}
            />
          ) : null}
          <span className="ml-auto">
            {members.data ? (
              <CountLabel shown={rows.length} total={items.length} noun="người" />
            ) : null}
          </span>
        </div>

        {members.isPending ? (
          <RowsSkeleton rows={6} />
        ) : listError && listFilters.count > 0 ? (
          <EmptyState
            size="sm"
            icon={FilterX}
            title="Không lọc được danh sách"
            description={productionErrorMessage(listError)}
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <FilterX />
                Xóa lọc
              </Button>
            }
          />
        ) : listError ? (
          <ErrorState size="sm" error={listError} onRetry={() => void members.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={UsersRound}
            title={filtering ? "Không có thành viên phù hợp" : "Chưa có thành viên"}
            description={
              filtering
                ? "Thử từ khóa khác hoặc bỏ bớt bộ lọc vai trò, team, trường và tag."
                : "Thêm tài khoản đầu tiên cho bộ phận sản xuất."
            }
            action={
              filtering ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <FilterX />
                  Xóa lọc
                </Button>
              ) : null
            }
          />
        ) : (
          <div
            aria-busy={members.isPlaceholderData || undefined}
            className={cn(
              "relative overflow-x-auto overscroll-x-contain transition-opacity duration-150",
              members.isPlaceholderData && "opacity-60"
            )}
            style={{ "--member-cols": template } as CSSProperties}
          >
            <div className="md:min-w-max">
              <div className="hidden grid-cols-(--member-cols) border-b text-xs font-medium text-foreground-muted md:grid">
                <span className="sticky left-0 z-10 bg-surface px-4 py-2.5">Thành viên</span>
                <span className="px-3 py-2.5">Vai trò sản xuất</span>
                <span className="px-3 py-2.5">Team</span>
                <span className="px-3 py-2.5">Tag</span>
                {columns.map((field) => (
                  <span key={field.id} className="truncate px-3 py-2.5" title={field.label}>
                    {field.label}
                  </span>
                ))}
                <span className="sticky right-0 z-10 bg-surface shadow-[-1px_0_0_var(--border)]">
                  <span className="sr-only">Thao tác</span>
                </span>
              </div>
              <ul className="divide-y">
                {visible.map((member) => {
                  const { lock, lockedRoles } = locksFor(member);
                  return (
                    <MemberRow
                      key={member.userId}
                      member={member}
                      teams={teamList}
                      tags={tagList}
                      fields={userFields}
                      columns={columns}
                      lock={lock}
                      lockedRoles={lockedRoles}
                      activating={
                        setActive.isPending && setActive.variables.userId === member.userId
                      }
                      onOpenProfile={() => setProfileOf(member)}
                      onAction={(action) => runAction(member, action)}
                      onRolesSaved={(result, jobs) => afterAccountChange(result, jobs, "role")}
                    />
                  );
                })}
              </ul>
            </div>
          </div>
        )}
        {rows.length > visible.length ? (
          <div className="flex justify-center border-t p-3">
            <Button variant="outline" size="sm" onClick={() => setLimit((value) => value + PAGE)}>
              Hiện thêm {Math.min(PAGE, rows.length - visible.length)} người
            </Button>
          </div>
        ) : null}
      </SettingsSection>

      <MemberProfileDialog
        key={profileOf?.userId ?? "none"}
        member={
          profileOf ? (items.find((item) => item.userId === profileOf.userId) ?? profileOf) : null
        }
        fields={userFields}
        tags={tagList}
        onClose={() => setProfileOf(null)}
      />
      <CreateMemberDialog
        key={createKey}
        open={creating}
        onOpenChange={setCreating}
        teams={teamList}
        onCreated={(result, { whitelisted }) => {
          setCreating(false);
          setSecret({
            kind: "created",
            name: result.member.displayName,
            email: result.member.email,
            password: result.temporaryPassword,
            whitelisted
          });
        }}
      />
      <TemporaryPasswordDialog secret={secret} onClose={() => setSecret(null)} />
      <MemberAccountConfirm
        request={request}
        onClose={() => setRequest(null)}
        onSecret={setSecret}
        onDeactivated={(member, jobs) => afterAccountChange(member, jobs, "deactivated")}
      />
      <LedJobsDialog
        member={ledOf ? (items.find((item) => item.userId === ledOf.userId) ?? ledOf) : null}
        onClose={() => setLedOf(null)}
      />
    </SettingsPage>
  );
};

const MemberRow = ({
  member,
  teams,
  tags,
  fields,
  columns,
  lock,
  lockedRoles,
  activating,
  onOpenProfile,
  onAction,
  onRolesSaved
}: {
  member: ProductionMember;
  teams: readonly Team[];
  tags: readonly Tag[];
  /** Every active USER field (phone chips); `columns` = the "hiện trong bảng" ones. */
  fields: readonly CustomField[];
  columns: readonly CustomField[];
  /** Account actions unavailable on this row (yourself, superadmin, org admin), or null. */
  lock: AccountLock | null;
  lockedRoles: Partial<Record<ProductionRole, string>>;
  activating: boolean;
  onOpenProfile: () => void;
  onAction: (action: MemberAction) => void;
  onRolesSaved: (member: ProductionMember, orphanedJobs: readonly LedJob[]) => void;
}) => {
  const session = useSessionContext();
  const update = useUpdateMember();
  const isSelf = member.userId === session.user.id;
  const rolesLocked = lock !== null && lock.kind !== "self";
  const canReactivate = !member.active && lock === null;
  const teamChoices = teams.filter((team) => team.active || team.id === member.teamId);
  const teamItems = [
    { value: NONE, label: "Chưa có team" },
    ...teamChoices.map((team) => ({ value: team.id, label: team.name }))
  ];

  const save = (
    input: Parameters<typeof update.mutate>[0]["input"],
    message: string,
    onSaved?: (member: ProductionMember, orphanedJobs: readonly LedJob[]) => void
  ) =>
    update.mutate(
      { userId: member.userId, input },
      {
        onSuccess: (result) => {
          if (result.orphanedJobs.length === 0) toast.success(message);
          onSaved?.(result.member, result.orphanedJobs);
        },
        onError: (error) => toastProductionError(error)
      }
    );

  const reactivate = (
    <Button
      variant="outline"
      size="sm"
      disabled={activating}
      onClick={() => onAction("activate")}
      className="col-span-2 md:hidden"
    >
      {activating ? <Spinner /> : <UserCheck />}
      Kích hoạt lại tài khoản
    </Button>
  );

  return (
    <li
      className={cn(
        "group/row grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 px-4 py-3 md:grid-cols-(--member-cols) md:items-center md:gap-0 md:p-0",
        !member.active && "bg-muted/30"
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 md:sticky md:left-0 md:z-[1] md:self-stretch md:bg-surface md:px-4 md:py-2.5 md:shadow-[1px_0_0_var(--border)]",
          !member.active && "md:bg-[color-mix(in_oklch,var(--muted)_30%,var(--surface))]"
        )}
      >
        <UserAvatar
          user={{ id: member.userId, displayName: member.displayName, avatarUrl: member.avatarUrl }}
          size="md"
          className={cn(!member.active && "opacity-60 grayscale")}
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium">
            {member.displayName}
            {isSelf ? <span className="font-normal text-foreground-muted"> (bạn)</span> : null}
          </span>
          {member.active ? (
            <span className="truncate text-xs text-foreground-muted">{member.email ?? "—"}</span>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground-muted">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-foreground-subtle"
              />
              <span className="truncate">Tài khoản đã vô hiệu</span>
            </span>
          )}
          {/* Tablet / desktop: the way back sits under the status; phones get a full button below. */}
          {canReactivate ? (
            <button
              type="button"
              disabled={activating}
              onClick={() => onAction("activate")}
              className="mt-0.5 hidden w-fit items-center gap-1 rounded text-xs font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:inline-flex"
            >
              {activating ? <Spinner className="size-3" /> : <UserCheck className="size-3.5" />}
              Kích hoạt lại
            </button>
          ) : null}
        </div>
      </div>

      {/* Phones: top-right of the card. Wider: last column, pinned right like the name column. */}
      <div
        className={cn(
          "col-start-2 row-start-1 flex items-center gap-0.5 self-center md:sticky md:right-0 md:z-[1] md:order-last md:col-start-auto md:row-start-auto md:justify-center md:self-stretch md:bg-surface md:shadow-[-1px_0_0_var(--border)]",
          !member.active && "md:bg-[color-mix(in_oklch,var(--muted)_30%,var(--surface))]"
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Hồ sơ sản xuất của ${member.displayName}`}
          title="Hồ sơ sản xuất"
          onClick={onOpenProfile}
        >
          <IdCard />
        </Button>
        <MemberActionsMenu member={member} lock={lock} onAction={onAction} />
      </div>

      <CustomFieldChips
        fields={fields}
        values={member.customValues}
        className="col-span-2 -mt-0.5 md:hidden"
      />

      <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1 md:px-3 md:py-2">
        <RoleToggleGroup
          aria-label={`Vai trò sản xuất của ${member.displayName}`}
          value={member.roles}
          locked={lockedRoles}
          onChange={(roles) =>
            save({ roles }, `Đã cập nhật vai trò của ${member.displayName}`, onRolesSaved)
          }
          className="max-sm:[&_button]:h-9 pointer-coarse:[&_button]:h-8"
        />
        {/* Touch screens have no tooltip: say why the chips are locked. */}
        {rolesLocked ? (
          <span className="flex items-start gap-1 text-[11px] leading-snug text-foreground-subtle md:hidden">
            <Lock className="mt-px size-3 shrink-0" aria-hidden="true" />
            {lock.kind === "superadmin"
              ? "Superadmin: vai trò không đổi được ở đây."
              : "Quản trị tổ chức: chỉ superadmin đổi được vai trò."}
          </span>
        ) : null}
      </div>

      <div className="col-span-2 min-w-0 md:col-span-1 md:px-3 md:py-2">
        <Select
          items={teamItems}
          value={member.teamId ?? NONE}
          onValueChange={(value: string | null) => {
            const teamId = !value || value === NONE ? null : value;
            if (teamId === member.teamId) return;
            const name = teams.find((team) => team.id === teamId)?.name;
            save(
              { teamId },
              name ? `${member.displayName} vào team ${name}` : `${member.displayName} đã rời team`
            );
          }}
        >
          <SelectTrigger size="sm" className="w-full" aria-label={`Team của ${member.displayName}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {teamItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-2 min-w-0 md:col-span-1 md:px-3 md:py-2">
        <TagPicker
          variant="cell"
          tags={tags}
          value={member.tagIds}
          onChange={(tagIds) => save({ tagIds }, `Đã cập nhật tag của ${member.displayName}`)}
          aria-label={`Tag của ${member.displayName}`}
          className="max-sm:min-h-10 max-sm:border max-sm:border-input max-sm:px-2"
        />
      </div>

      {columns.map((field) => (
        <div key={field.id} className="hidden min-w-0 px-3 py-2 text-[13px] md:block">
          <CustomFieldValue field={field} value={member.customValues[field.key]} />
        </div>
      ))}

      {canReactivate ? reactivate : null}
    </li>
  );
};

const MemberProfileDialog = ({
  member,
  fields,
  tags,
  onClose
}: {
  member: ProductionMember | null;
  fields: readonly CustomField[];
  tags: readonly Tag[];
  onClose: () => void;
}) => {
  const ids = useId();
  const me = useProductionMe();
  const update = useUpdateMember();
  const [values, setValues] = useState<CustomValues>(member?.customValues ?? {});
  const [tagIds, setTagIds] = useState<string[]>(member?.tagIds ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const today = me.data ? todayIn(me.data.settings.timezone) : undefined;

  const submit = () => {
    if (!member) return;
    const problems = validateCustomValues(fields, values, { enforceRequired: false });
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    update.mutate(
      {
        userId: member.userId,
        input: { customValues: toCustomValuesPayload(fields, values), tagIds }
      },
      {
        onSuccess: () => {
          toast.success(`Đã lưu hồ sơ của ${member.displayName}`);
          onClose();
        },
        onError: (error) => setFormError(productionErrorMessage(error))
      }
    );
  };

  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl",
          sheetOnPhone
        )}
      >
        <form
          noValidate
          className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col max-sm:max-h-[92dvh]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <DialogTitle className="flex items-center gap-2">
              {member ? (
                <UserAvatar
                  user={{
                    id: member.userId,
                    displayName: member.displayName,
                    avatarUrl: member.avatarUrl
                  }}
                  size="sm"
                />
              ) : null}
              <span className="truncate">Hồ sơ sản xuất · {member?.displayName}</span>
            </DialogTitle>
            <DialogDescription>
              {member ? <RoleBadges roles={member.roles} /> : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <Field>
              <FieldLabel id={`${ids}-tags`}>Tag</FieldLabel>
              <TagPicker
                tags={tags}
                value={tagIds}
                onChange={setTagIds}
                aria-label="Tag của thành viên"
              />
            </Field>
            {fields.length > 0 ? (
              <CustomFieldsForm
                fields={fields}
                values={values}
                onChange={(next) => {
                  setValues(next);
                  setErrors({});
                  setFormError(null);
                }}
                errors={errors}
                idPrefix={ids}
                today={today}
              />
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground-muted">
                Chưa có trường tùy chỉnh cho thành viên. Thêm trường (ví dụ “Năng lực”) trong mục
                Trường tùy chỉnh.
              </p>
            )}
            <FormAlert>{formError}</FormAlert>
          </div>
          <DialogFooter className="mx-0 mb-0 px-4 py-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Spinner /> : null}
              Lưu hồ sơ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
