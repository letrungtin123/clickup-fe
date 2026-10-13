import { cn } from "cn";
import {
  GitBranch,
  Info,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
  UsersRound
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { Link } from "@/components/shared/router-link";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  defaultJobPermissions,
  jobPermissionActions,
  jobPermissionRoles,
  type JobPermissionAction,
  type JobPermissionMatrix,
  type JobPermissionRole,
  type JobPermissionScope,
  type ProductionSettings
} from "@/contracts/production-catalog";
import { RoleBadge } from "@/features/production/components/role-chips";
import {
  FormAlert,
  InfoNote,
  PageIntro,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { productionErrorMessage } from "@/features/production/errors";
import { useProductionSettings, useUpdateSettings } from "@/features/production/hooks";
import {
  jobActionLabels,
  jobScopeChanges,
  jobScopeItems,
  jobScopeLabels,
  jobScopeMeaning,
  sameJobPermissions,
  withJobScope
} from "@/features/production/job-permissions";
import { settingsPageBySlug } from "@/features/production/nav";
import { productionRoleLabels } from "@/features/production/roles";
import { useBreakpoint } from "@/hooks/use-breakpoint";

const adminNote = "Quản trị luôn có toàn quyền";

/**
 * Cấu hình → Phân quyền Job (PD-036): for each production role, how far it may view, create,
 * update and delete jobs and their lines — none, its own, or all. ADMIN is always "all" (read-only
 * row). Saving sends `{ jobPermissions }` only; the API checks every action again. Phones get one
 * card per role (selects stacked), wider screens a role × action table (one tree per tier).
 */
export const ProductionJobPermissionsRoute = () => {
  const settings = useProductionSettings();
  return (
    <SettingsPage>
      <PageIntro slug="job-permissions" />
      {settings.isPending ? (
        <div className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <JobPermissionsForm settings={settings.data} />
      )}
    </SettingsPage>
  );
};

const JobPermissionsForm = ({ settings }: { settings: ProductionSettings }) => {
  const update = useUpdateSettings();
  const mobile = useBreakpoint() === "mobile";
  const saved = settings.jobPermissions;
  // null = not edited: the page follows the server value (also after another Admin saves).
  const [draft, setDraft] = useState<JobPermissionMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? saved;
  const changes = jobScopeChanges(saved, value);
  const changed = new Set(changes.map((change) => `${change.role}.${change.action}`));
  const dirty = changes.length > 0;
  const isDefault = sameJobPermissions(value, defaultJobPermissions);

  const edit = (next: JobPermissionMatrix) => {
    setDraft(next);
    setError(null);
  };
  const setScope =
    (role: JobPermissionRole, action: JobPermissionAction) => (scope: JobPermissionScope) =>
      edit(withJobScope(value, role, action, scope));

  const save = () =>
    update.mutate(
      { jobPermissions: value },
      {
        onSuccess: () => {
          setDraft(null);
          setError(null);
          toast.success("Đã lưu phân quyền Job", {
            description: "Áp dụng cho các thao tác tiếp theo của mọi người."
          });
        },
        onError: (cause) => setError(productionErrorMessage(cause))
      }
    );

  const cell = (role: JobPermissionRole, action: JobPermissionAction) => (
    <ScopeSelect
      label={`${jobActionLabels[action]} — ${productionRoleLabels[role]}`}
      value={value[role][action]}
      changed={changed.has(`${role}.${action}`)}
      disabled={update.isPending}
      onChange={setScope(role, action)}
    />
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-4 pb-20"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) save();
      }}
    >
      <SettingsSection
        title="Quyền theo vai trò"
        description="Một người có nhiều vai trò dùng quyền rộng nhất trong các vai trò đó."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDefault || update.isPending}
            title={isDefault ? "Đang dùng cấu hình mặc định" : undefined}
            onClick={() => edit(defaultJobPermissions)}
          >
            <RotateCcw />
            Khôi phục mặc định
          </Button>
        }
      >
        {mobile ? (
          <div className="flex flex-col gap-3 p-3">
            <AdminCard />
            {jobPermissionRoles.map((role) => (
              <div key={role} className="flex flex-col gap-2.5 rounded-lg border px-3 py-3">
                <RoleBadge role={role} className="self-start" />
                <div className="flex flex-col gap-2">
                  {jobPermissionActions.map((action) => (
                    <div key={action} className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-medium">{jobActionLabels[action]}</span>
                      <div className="w-40 shrink-0">{cell(role, action)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Safety net only: the table fits from 768px; a narrower pane scrolls the table, not the page.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] table-fixed border-collapse text-[13px]">
              <caption className="sr-only">Phân quyền Job theo vai trò và thao tác</caption>
              <colgroup>
                <col className="w-[22%]" />
                {jobPermissionActions.map((action) => (
                  <col key={action} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-foreground-muted">
                  <th scope="col" className="px-4 py-2 text-left font-medium md:px-5">
                    Vai trò
                  </th>
                  {jobPermissionActions.map((action) => (
                    <th key={action} scope="col" className="py-2 pr-1.5 pl-4 text-left font-medium">
                      {jobActionLabels[action]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr className="bg-muted/20">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal md:px-5">
                    <span className="flex flex-col items-start gap-1">
                      <RoleBadge role="ADMIN" />
                      <span className="text-[11px] leading-snug text-foreground-muted">
                        {adminNote}
                      </span>
                    </span>
                  </th>
                  {jobPermissionActions.map((action) => (
                    <td key={action} className="px-1.5 py-2.5">
                      <FixedAll />
                    </td>
                  ))}
                </tr>
                {jobPermissionRoles.map((role) => (
                  <tr key={role}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal md:px-5">
                      <RoleBadge role={role} />
                    </th>
                    {jobPermissionActions.map((action) => (
                      <td key={action} className="px-1.5 py-2.5">
                        {cell(role, action)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>

      <ScopeLegend />

      <div className="flex flex-col gap-2">
        <InfoNote icon={UsersRound}>
          Quyền rộng nhất thắng: ví dụ một người vừa là QC vừa là Leader được làm mọi việc mà Leader
          được phép, kể cả khi QC chỉ có “Của mình”.
        </InfoNote>
        <InfoNote icon={GitBranch}>
          Bảng này không quyết định việc chuyển trạng thái (nhận việc, gửi QC, Done…): ai được
          chuyển giữa các trạng thái đặt ở{" "}
          <Link
            to="/production/settings/workflow"
            className="font-medium text-brand-text underline-offset-2 hover:underline"
          >
            Cấu hình → {settingsPageBySlug("workflow")?.label ?? "Trạng thái & luồng chuyển"}
          </Link>
          .
        </InfoNote>
      </div>

      <FormAlert>{error}</FormAlert>

      <AnimatePresence>
        {dirty ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-surface-raised px-4 py-3 shadow-lg"
          >
            <span className="flex min-w-0 flex-1 items-center gap-3 text-[13px] max-sm:basis-full">
              <Info className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
              {changes.length} thay đổi chưa lưu
              {sameJobPermissions(value, defaultJobPermissions) ? " (về mặc định)" : ""}.
            </span>
            <Button
              type="button"
              variant="ghost"
              className="max-sm:ml-auto"
              disabled={update.isPending}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              <Undo2 />
              Hoàn tác
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Spinner /> : <Save />}
              Lưu thay đổi
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );
};

const scopeDotClass: Record<JobPermissionScope, string> = {
  none: "bg-foreground-subtle",
  own: "bg-brand",
  all: "bg-success"
};

const ScopeDot = ({ scope, className }: { scope: JobPermissionScope; className?: string }) => (
  <span
    aria-hidden="true"
    className={cn("inline-block size-2 shrink-0 rounded-full", scopeDotClass[scope], className)}
  />
);

const ScopeSelect = ({
  label,
  value,
  changed,
  disabled,
  onChange
}: {
  label: string;
  value: JobPermissionScope;
  changed: boolean;
  disabled: boolean;
  onChange: (scope: JobPermissionScope) => void;
}) => (
  <Select
    items={jobScopeItems}
    value={value}
    disabled={disabled}
    onValueChange={(next: JobPermissionScope | null) => {
      if (next) onChange(next);
    }}
  >
    <SelectTrigger
      aria-label={label}
      data-changed={changed || undefined}
      className={cn(
        "w-full text-[13px]",
        changed && "border-brand/60 bg-brand-soft/60 dark:bg-brand-soft/60"
      )}
    >
      <SelectValue>
        <ScopeDot scope={value} />
        <span className="truncate">{jobScopeLabels[value]}</span>
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      {jobScopeItems.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          <ScopeDot scope={item.value} />
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/** ADMIN's read-only "Tất cả" (not stored, cannot be changed). */
const FixedAll = () => (
  <span className="flex h-8 items-center gap-1.5 px-2.5 text-[13px] text-foreground-muted">
    <ScopeDot scope="all" />
    {jobScopeLabels.all}
    <Lock className="size-3 text-foreground-subtle" aria-label="Không đổi được" />
  </span>
);

const AdminCard = () => (
  <div className="flex flex-col gap-2.5 rounded-lg border bg-muted/30 px-3 py-3">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <RoleBadge role="ADMIN" />
      <span className="text-xs text-foreground-muted">{adminNote}</span>
    </div>
    <dl className="grid grid-cols-4 gap-2">
      {jobPermissionActions.map((action) => (
        <div key={action} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[11px] text-foreground-muted">{jobActionLabels[action]}</dt>
          <dd className="flex items-center gap-1 text-[13px] text-foreground-muted">
            <ScopeDot scope="all" />
            <span className="truncate">{jobScopeLabels.all}</span>
          </dd>
        </div>
      ))}
    </dl>
  </div>
);

/** What each level means per action (mirrors the API rules, see job-permissions.ts). */
const ScopeLegend = () => (
  <SettingsSection
    title="Ý nghĩa các mức"
    description={
      <>
        <span className="font-medium text-foreground">{jobScopeLabels.none}</span>: không được làm
        việc đó. <span className="font-medium text-foreground">{jobScopeLabels.all}</span>: mọi job
        và dòng việc. <span className="font-medium text-foreground">{jobScopeLabels.own}</span>: tùy
        thao tác như dưới đây.
      </>
    }
  >
    <dl className="grid gap-px bg-border sm:grid-cols-2">
      {jobPermissionActions.map((action) => (
        <div key={action} className="flex flex-col gap-1.5 bg-surface px-4 py-3 md:px-5">
          <dt className="text-[13px] font-medium">{jobActionLabels[action]}</dt>
          <dd className="flex flex-col gap-1 text-xs leading-relaxed text-foreground-muted">
            <span className="flex items-start gap-2">
              <ScopeDot scope="own" className="mt-1.5" />
              <span className="min-w-0">
                <span className="font-medium text-foreground">{jobScopeLabels.own}:</span>{" "}
                {jobScopeMeaning[action].own}
              </span>
            </span>
            <span className="flex items-start gap-2">
              <ScopeDot scope="all" className="mt-1.5" />
              <span className="min-w-0">
                <span className="font-medium text-foreground">{jobScopeLabels.all}:</span>{" "}
                {jobScopeMeaning[action].all}
              </span>
            </span>
          </dd>
        </div>
      ))}
    </dl>
    <p className="flex items-start gap-2 border-t px-4 py-3 text-xs leading-relaxed text-foreground-muted md:px-5">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
      Máy chủ kiểm tra lại quyền ở mỗi thao tác; menu và nút trong trang Job chỉ hiện theo quyền của
      bạn.
    </p>
  </SettingsSection>
);
