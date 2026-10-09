import { cn } from "cn";
import { FolderKanban, Plus, Timer } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ProductionProject } from "@/contracts/production-catalog";
import { matchesQuery, visibleRows } from "@/features/production/catalog";
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
import {
  useClients,
  useProductionProjects,
  useProjectMutations
} from "@/features/production/hooks";
import type { Client } from "@/features/production/types";
import { sheetOnPhone } from "@/features/production/ui";

const conflict = "Mã dự án đã tồn tại (không phân biệt hoa thường). Hãy chọn mã khác.";
const ALL = "__all__";
const NONE = "__none__";
const grid = "md:grid-cols-[7rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_6.5rem_2.25rem]";

/** Projects (credit lookup is per project × process). Codes are unique case-insensitively. */
export const ProductionProjectsRoute = () => {
  const projects = useProductionProjects();
  const clients = useClients();
  const mutations = useProjectMutations();
  const [term, setTerm] = useState("");
  const [clientFilter, setClientFilter] = useState<string>(ALL);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ project: ProductionProject | null } | null>(null);

  const items = useMemo(() => projects.data?.items ?? [], [projects.data]);
  const rows = useMemo(
    () =>
      visibleRows(items, showArchived).filter(
        (project) =>
          matchesQuery(term, project.code, project.name, project.clientName) &&
          (clientFilter === ALL ||
            (clientFilter === NONE ? project.clientId === null : project.clientId === clientFilter))
      ),
    [items, showArchived, term, clientFilter]
  );
  const archivedCount = items.filter((project) => !project.active).length;
  const clientItems = [
    { value: ALL, label: "Mọi khách hàng" },
    { value: NONE, label: "Chưa gán khách hàng" },
    ...(clients.data?.items ?? []).map((client) => ({ value: client.id, label: client.name }))
  ];

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
          <Button onClick={() => setDialog({ project: null })}>
            <Plus />
            Thêm dự án
          </Button>
        }
      />
      <SettingsSection>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <SearchField
            value={term}
            onChange={setTerm}
            placeholder="Tìm theo mã, tên, khách hàng"
            label="Tìm dự án"
          />
          <Select
            items={clientItems}
            value={clientFilter}
            onValueChange={(value: string | null) => setClientFilter(value ?? ALL)}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label="Lọc theo khách hàng">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clientItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            "hidden gap-4 border-b px-4 py-2.5 text-xs font-medium text-foreground-muted md:grid",
            grid
          )}
        >
          <span>Mã</span>
          <span>Tên dự án</span>
          <span>Khách hàng</span>
          <span>Buffer QC</span>
          <span>Trạng thái</span>
          <span className="sr-only">Thao tác</span>
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
                ? "Tạo dự án (mã viết tắt, khách hàng) hoặc nhập bảng đơn giá CSV với tùy chọn tạo dự án mới."
                : "Thử từ khóa khác, bỏ lọc khách hàng hoặc hiện mục đã lưu trữ."
            }
            action={
              items.length === 0 ? (
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
                  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 md:gap-4",
                  grid,
                  !project.active && "bg-muted/30"
                )}
              >
                <span className="justify-self-start rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
                  {project.code}
                </span>
                <button
                  type="button"
                  onClick={() => setDialog({ project })}
                  className={cn(
                    "min-w-0 truncate rounded text-left text-[13px] font-medium outline-none hover:text-brand-text focus-visible:ring-2 focus-visible:ring-ring",
                    !project.active && "text-foreground-muted"
                  )}
                >
                  {project.name}
                </button>
                <span className="col-start-3 row-start-1 justify-self-end md:col-start-6">
                  <RowMenu
                    label={project.code}
                    active={project.active}
                    onEdit={() => setDialog({ project })}
                    onToggleActive={() => toggleActive(project)}
                  />
                </span>
                <span className="col-span-2 truncate text-xs text-foreground-muted md:col-span-1 md:text-[13px]">
                  {project.clientName ?? <span className="text-foreground-subtle">Chưa gán</span>}
                </span>
                <span className="hidden items-center gap-1 text-[13px] tabular-nums md:inline-flex">
                  <Timer className="size-3.5 text-foreground-subtle" aria-hidden="true" />
                  {project.qcBufferHours} giờ
                </span>
                <ActiveState active={project.active} className="hidden md:inline-flex" />
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <ProjectDialog
        key={dialog?.project?.id ?? "new"}
        open={dialog !== null}
        project={dialog?.project ?? null}
        clients={clients.data?.items ?? []}
        onClose={() => setDialog(null)}
      />
    </SettingsPage>
  );
};

const ProjectDialog = ({
  open,
  project,
  clients,
  onClose
}: {
  open: boolean;
  project: ProductionProject | null;
  clients: readonly Client[];
  onClose: () => void;
}) => {
  const ids = useId();
  const mutations = useProjectMutations();
  const [code, setCode] = useState(project?.code ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [clientId, setClientId] = useState<string>(project?.clientId ?? NONE);
  const [buffer, setBuffer] = useState(String(project?.qcBufferHours ?? 0));
  const [errors, setErrors] = useState<{ code?: string; name?: string; buffer?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;
  const choices = clients.filter((client) => client.active || client.id === project?.clientId);
  const clientItems = [
    { value: NONE, label: "Không gán khách hàng" },
    ...choices.map((client) => ({ value: client.id, label: client.name }))
  ];

  const submit = () => {
    const next = { code: code.trim(), name: name.trim(), buffer: buffer.trim() };
    const hours = Number(next.buffer);
    const problems: typeof errors = {};
    if (!next.code) problems.code = "Nhập mã dự án.";
    if (!next.name) problems.name = "Nhập tên dự án.";
    if (!/^\d+$/.test(next.buffer) || hours > 720) problems.buffer = "Số giờ nguyên từ 0 đến 720.";
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const input = {
      code: next.code,
      name: next.name,
      clientId: clientId === NONE ? null : clientId,
      qcBufferHours: hours
    };
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
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Field>
              <FieldLabel id={`${ids}-client`}>Khách hàng</FieldLabel>
              <Select
                items={clientItems}
                value={clientId}
                onValueChange={(value: string | null) => setClientId(value ?? NONE)}
              >
                <SelectTrigger className="w-full" aria-labelledby={`${ids}-client`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clientItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={Boolean(errors.buffer)}>
              <FieldLabel htmlFor={`${ids}-buffer`}>Buffer QC (giờ)</FieldLabel>
              <Input
                id={`${ids}-buffer`}
                inputMode="numeric"
                value={buffer}
                className="tabular-nums"
                aria-invalid={Boolean(errors.buffer)}
                onChange={(event) => setBuffer(event.target.value)}
              />
              {errors.buffer ? <FieldError>{errors.buffer}</FieldError> : null}
            </Field>
          </div>
          <FieldDescription className="-mt-2 text-xs">
            Hạn chót mặc định của task = hạn chót job − buffer QC, để QC còn thời gian kiểm tra.
            Leader vẫn sửa được hạn của từng task.
          </FieldDescription>
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
