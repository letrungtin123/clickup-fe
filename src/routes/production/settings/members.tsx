import { cn } from "cn";
import { IdCard, UsersRound } from "lucide-react";
import { useId, useMemo, useState, type CSSProperties } from "react";
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
import { useSessionContext } from "@/features/auth/hooks";
import { matchesQuery } from "@/features/production/catalog";
import {
  CustomFieldsForm,
  CustomFieldValue
} from "@/features/production/components/custom-field-input";
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
import {
  fieldsFor,
  toCustomValuesPayload,
  validateCustomValues
} from "@/features/production/custom-fields";
import { productionErrorMessage, toastProductionError } from "@/features/production/errors";
import { todayIn } from "@/features/production/format";
import {
  useCustomFields,
  useProductionMe,
  useProductionMembers,
  useTags,
  useTeams,
  useUpdateMember
} from "@/features/production/hooks";
import { productionRoleColors, productionRoleLabels } from "@/features/production/roles";
import type { Tag, Team } from "@/features/production/types";
import { toneClass } from "@/lib/colors";
import { sheetOnPhone } from "@/features/production/ui";

const ALL = "__all__";
const NONE = "__none__";
const PAGE = 100;

type RoleFilter = typeof ALL | typeof NONE | ProductionRole;

/**
 * Production members (PD-011): every organization member is listed for the Admin, who grants
 * production roles (multi-valued), a report team, USER custom fields and tags.
 */
export const ProductionMembersRoute = () => {
  const members = useProductionMembers();
  const teams = useTeams();
  const tags = useTags();
  const fields = useCustomFields();
  const [term, setTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(ALL);
  const [teamFilter, setTeamFilter] = useState<string>(ALL);
  const [limit, setLimit] = useState(PAGE);
  const [profileOf, setProfileOf] = useState<ProductionMember | null>(null);

  const items = useMemo(() => members.data?.items ?? [], [members.data]);
  const teamList = useMemo(() => teams.data?.items ?? [], [teams.data]);
  const tagList = useMemo(() => tags.data?.items ?? [], [tags.data]);
  const userFields = useMemo(() => fieldsFor(fields.data?.items ?? [], "USER"), [fields.data]);
  const columns = userFields.filter((field) => field.showInTable);

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
    "3rem"
  ].join(" ");

  const filterChips: { value: RoleFilter; label: string }[] = [
    { value: ALL, label: "Tất cả" },
    ...productionRoleCodes.map((role) => ({ value: role, label: productionRoleLabels[role] })),
    { value: NONE, label: "Chưa có vai trò" }
  ];

  return (
    <SettingsPage>
      <PageIntro slug="members">
        Gán vai trò sản xuất (một người có thể giữ nhiều vai trò), team báo cáo, trường tùy chỉnh và
        tag. Tạo tài khoản mới ở{" "}
        <span className="font-medium text-foreground">Cài đặt › Thành viên</span>.
      </PageIntro>

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
            onChange={setTerm}
            placeholder="Tìm theo tên hoặc email"
            label="Tìm thành viên"
          />
          <Select
            items={teamItems}
            value={teamFilter}
            onValueChange={(value: string | null) => {
              setTeamFilter(value ?? ALL);
              setLimit(PAGE);
            }}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Lọc theo team">
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
          <span className="ml-auto">
            {members.data ? (
              <CountLabel shown={rows.length} total={items.length} noun="người" />
            ) : null}
          </span>
        </div>

        {members.isPending ? (
          <RowsSkeleton rows={6} />
        ) : members.isError ? (
          <ErrorState size="sm" error={members.error} onRetry={() => void members.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={UsersRound}
            title="Không có thành viên phù hợp"
            description="Thử từ khóa khác hoặc bỏ bộ lọc vai trò/team."
          />
        ) : (
          <div
            className="overflow-x-auto overscroll-x-contain"
            style={{ "--member-cols": template } as CSSProperties}
          >
            <div className="md:min-w-max">
              <div className="hidden grid-cols-(--member-cols) border-b text-xs font-medium text-foreground-muted md:grid">
                <span className="sticky left-0 z-10 bg-surface px-4 py-2.5">Thành viên</span>
                <span className="px-3 py-2.5">Vai trò sản xuất</span>
                <span className="px-3 py-2.5">Team</span>
                <span className="px-3 py-2.5">Tag</span>
                {columns.map((field) => (
                  <span key={field.id} className="truncate px-3 py-2.5">
                    {field.label}
                  </span>
                ))}
                <span className="sr-only">Hồ sơ</span>
              </div>
              <ul className="divide-y">
                {visible.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    teams={teamList}
                    tags={tagList}
                    columns={columns}
                    onOpenProfile={() => setProfileOf(member)}
                  />
                ))}
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
    </SettingsPage>
  );
};

const MemberRow = ({
  member,
  teams,
  tags,
  columns,
  onOpenProfile
}: {
  member: ProductionMember;
  teams: readonly Team[];
  tags: readonly Tag[];
  columns: readonly CustomField[];
  onOpenProfile: () => void;
}) => {
  const session = useSessionContext();
  const update = useUpdateMember();
  const isSelf = member.userId === session.user.id;
  const lockAdmin =
    isSelf && !session.hasFullOrganizationAuthority && member.roles.includes("ADMIN");
  const teamChoices = teams.filter((team) => team.active || team.id === member.teamId);
  const teamItems = [
    { value: NONE, label: "Chưa có team" },
    ...teamChoices.map((team) => ({ value: team.id, label: team.name }))
  ];

  const save = (input: Parameters<typeof update.mutate>[0]["input"], message: string) =>
    update.mutate(
      { userId: member.userId, input },
      {
        onSuccess: () => toast.success(message),
        onError: (error) => toastProductionError(error)
      }
    );

  return (
    <li
      className={cn(
        "group/row grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 px-4 py-3 md:grid-cols-(--member-cols) md:items-center md:gap-0 md:p-0",
        !member.active && "bg-muted/30"
      )}
    >
      <div className="flex min-w-0 items-center gap-3 md:sticky md:left-0 md:z-[1] md:self-stretch md:bg-surface md:px-4 md:py-2.5 md:shadow-[1px_0_0_var(--border)]">
        <UserAvatar
          user={{ id: member.userId, displayName: member.displayName, avatarUrl: member.avatarUrl }}
          size="md"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium">
            {member.displayName}
            {isSelf ? <span className="font-normal text-foreground-muted"> (bạn)</span> : null}
          </span>
          <span className="truncate text-xs text-foreground-muted">
            {member.active ? (member.email ?? "—") : "Tài khoản đã vô hiệu"}
          </span>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Hồ sơ sản xuất của ${member.displayName}`}
        title="Hồ sơ sản xuất"
        onClick={onOpenProfile}
        className="col-start-2 row-start-1 self-center md:order-last md:col-start-auto md:row-start-auto md:justify-self-center"
      >
        <IdCard />
      </Button>

      <div className="col-span-2 md:col-span-1 md:px-3 md:py-2">
        <RoleToggleGroup
          aria-label={`Vai trò sản xuất của ${member.displayName}`}
          value={member.roles}
          locked={lockAdmin ? { ADMIN: "Bạn không thể tự bỏ quyền Quản trị của mình" } : {}}
          onChange={(roles) => save({ roles }, `Đã cập nhật vai trò của ${member.displayName}`)}
          className="max-sm:[&_button]:h-9"
        />
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
