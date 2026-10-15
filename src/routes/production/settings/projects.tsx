import { cn } from "cn";
import { FolderKanban, Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionProject } from "@/contracts/production-catalog";
import { matchesQuery, visibleRows } from "@/features/production/catalog";
import { useCanEditProductionConfig } from "@/features/production/config-access";
import {
  ActiveState,
  ArchivedToggle,
  CountLabel,
  FormAlert,
  PageIntro,
  RowMenu,
  RowsSkeleton,
  SearchField,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { productionErrorMessage, toastProductionError } from "@/features/production/errors";
import { useProductionProjects, useProjectMutations } from "@/features/production/hooks";
import { sheetOnPhone } from "@/features/production/ui";

const conflict = "Mã dự án đã tồn tại (không phân biệt hoa thường). Hãy chọn mã khác.";
const grid =
  "md:grid-cols-[6rem_minmax(0,1fr)_6.5rem_2.25rem] md:gap-3 lg:grid-cols-[7rem_minmax(0,1fr)_7rem_2.25rem] lg:gap-4";
/** Read-only viewers have no row menu: no actions column. */
const readOnlyGrid =
  "md:grid-cols-[6rem_minmax(0,1fr)_6.5rem] md:gap-3 lg:grid-cols-[7rem_minmax(0,1fr)_7rem] lg:gap-4";

/**
 * Projects (credit lookup is per project × process). Codes are unique case-insensitively. The form is
 * Mã · Tên dự án · Mô tả only (owner, 2026-10-13); client and QC buffer are no longer entered here.
 * PD-050: only the organization superadmin adds, edits or archives projects; everyone else reads the list.
 */
export const ProductionProjectsRoute = () => {
  const canEdit = useCanEditProductionConfig();
  const projects = useProductionProjects();
  const mutations = useProjectMutations();
  const [term, setTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ project: ProductionProject | null } | null>(null);

  const items = useMemo(() => projects.data?.items ?? [], [projects.data]);
  const rows = useMemo(
    () =>
      visibleRows(items, showArchived).filter((project) =>
        matchesQuery(term, project.code, project.name, project.description)
      ),
    [items, showArchived, term]
  );
  const archivedCount = items.filter((project) => !project.active).length;

  const toggleActive = (project: ProductionProject) =>
    mutations.update.mutate(
      {
        id: project.id,
        input: { active: !project.active }
      },
      {
        onSuccess: () =>
          toast.success(
            project.active
              ? `Đã lưu trữ dự án ${project.code}`
              : `Đã khôi phục dự án ${project.code}`
          ),
        onError: (error) => toastProductionError(error, { conflict })
      }
    );

  return (
    <SettingsPage>
      <PageIntro
        slug="projects"
        actions={
          canEdit ? (
            <Button onClick={() => setDialog({ project: null })}>
              <Plus />
              Thêm dự án
            </Button>
          ) : undefined
        }
      />
      <SettingsSection>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          {/* Phones: the search takes its own row, the archived toggle and count wrap below it. */}
          <SearchField
            className="basis-full sm:basis-auto"
            value={term}
            onChange={setTerm}
            placeholder="Tìm theo mã, tên, mô tả"
            label="Tìm dự án"
          />
          <div className="flex flex-1 items-center justify-end gap-3">
            <ArchivedToggle
              checked={showArchived}
              onChange={setShowArchived}
              count={archivedCount}
            />
            {projects.data ? (
              <CountLabel shown={rows.length} total={items.length} noun="dự án" />
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "hidden border-b px-4 py-2.5 text-xs font-medium text-foreground-muted md:grid",
            canEdit ? grid : readOnlyGrid
          )}
        >
          <span>Mã</span>
          <span>Tên dự án · Mô tả</span>
          <span>Trạng thái</span>
          {canEdit ? <span className="sr-only">Thao tác</span> : null}
        </div>
        {projects.isPending ? (
          <RowsSkeleton rows={6} />
        ) : projects.isError ? (
          <ErrorState size="sm" error={projects.error} onRetry={() => void projects.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={FolderKanban}
            title={items.length === 0 ? "Chưa có dự án" : "Không có dự án phù hợp"}
            description={
              items.length === 0
                ? canEdit
                  ? "Tạo dự án (mã viết tắt, tên, mô tả) hoặc nhập bảng đơn giá CSV với tùy chọn tạo dự án mới."
                  : undefined
                : "Thử từ khóa khác hoặc hiện mục đã lưu trữ."
            }
            action={
              items.length === 0 && canEdit ? (
                <Button size="sm" onClick={() => setDialog({ project: null })}>
                  <Plus />
                  Thêm dự án
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map((project) => (
              <li
                key={project.id}
                className={cn(
                  "grid items-center gap-x-3 gap-y-1 px-4 py-2.5",
                  canEdit
                    ? "grid-cols-[auto_minmax(0,1fr)_auto]"
                    : "grid-cols-[auto_minmax(0,1fr)]",
                  canEdit ? grid : readOnlyGrid,
                  !project.active && "bg-muted/30"
                )}
              >
                <span className="justify-self-start rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
                  {project.code}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setDialog({ project })}
                    className="flex min-w-0 flex-col justify-center self-stretch rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ProjectName project={project} editable />
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-col justify-center self-stretch">
                    <ProjectName project={project} editable={false} />
                  </div>
                )}
                {canEdit ? (
                  <span className="col-start-3 row-start-1 justify-self-end md:col-start-4">
                    <RowMenu
                      label={project.code}
                      active={project.active}
                      onEdit={() => setDialog({ project })}
                      onToggleActive={() => toggleActive(project)}
                    />
                  </span>
                ) : null}
                <ActiveState
                  active={project.active}
                  className="hidden md:col-start-3 md:row-start-1 md:inline-flex"
                />
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      {canEdit ? (
        <ProjectDialog
          key={dialog?.project?.id ?? "new"}
          open={dialog !== null}
          project={dialog?.project ?? null}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </SettingsPage>
  );
};

const ProjectName = ({ project, editable }: { project: ProductionProject; editable: boolean }) => (
  <>
    <span
      className={cn(
        "truncate text-[13px] font-medium",
        editable && "hover:text-brand-text",
        !project.active && "text-foreground-muted"
      )}
    >
      {project.name}
    </span>
    {project.description ? (
      <span className="truncate text-xs text-foreground-muted" title={project.description}>
        {project.description}
      </span>
    ) : null}
  </>
);

const ProjectDialog = ({
  open,
  project,
  onClose
}: {
  open: boolean;
  project: ProductionProject | null;
  onClose: () => void;
}) => {
  const ids = useId();
  const mutations = useProjectMutations();
  const [code, setCode] = useState(project?.code ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;

  const submit = () => {
    const next = { code: code.trim(), name: name.trim(), description: description.trim() };
    const problems: typeof errors = {};
    if (!next.code) problems.code = "Nhập mã dự án.";
    if (!next.name) problems.name = "Nhập tên dự án.";
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const input = { code: next.code, name: next.name, description: next.description || null };
    const callbacks = {
      onSuccess: () => {
        toast.success(project ? `Đã cập nhật dự án ${input.code}` : `Đã thêm dự án ${input.code}`);
        onClose();
      },
      onError: (failure: unknown) => setFormError(productionErrorMessage(failure, { conflict }))
    };
    if (project) mutations.update.mutate({ id: project.id, input }, callbacks);
    else mutations.create.mutate(input, callbacks);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={cn("sm:max-w-lg", sheetOnPhone)}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{project ? `Sửa dự án ${project.code}` : "Thêm dự án"}</DialogTitle>
            <DialogDescription>
              Mã dự án dùng khi nhập bảng đơn giá CSV (cột project_code) và hiển thị trên job.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <Field data-invalid={Boolean(errors.code)}>
              <FieldLabel htmlFor={`${ids}-code`}>Mã</FieldLabel>
              <Input
                id={`${ids}-code`}
                autoFocus
                value={code}
                maxLength={40}
                placeholder="VD: ABC"
                className="font-mono"
                aria-invalid={Boolean(errors.code)}
                onChange={(event) => {
                  setCode(event.target.value);
                  setFormError(null);
                }}
              />
              {errors.code ? <FieldError>{errors.code}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor={`${ids}-name`}>Tên dự án</FieldLabel>
              <Input
                id={`${ids}-name`}
                value={name}
                maxLength={160}
                aria-invalid={Boolean(errors.name)}
                onChange={(event) => setName(event.target.value)}
              />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor={`${ids}-description`}>
              Mô tả <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
            </FieldLabel>
            <Textarea
              id={`${ids}-description`}
              value={description}
              maxLength={2000}
              rows={3}
              placeholder="Khách hàng, yêu cầu chung, ghi chú cho đội…"
              onChange={(event) => setDescription(event.target.value)}
            />
            <FieldDescription className="text-xs">Tối đa 2.000 ký tự.</FieldDescription>
          </Field>
          <FormAlert>{formError}</FormAlert>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {project ? "Lưu thay đổi" : "Thêm dự án"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
