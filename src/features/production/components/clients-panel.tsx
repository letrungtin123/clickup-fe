import { cn } from "cn";
import { Building2, Plus } from "lucide-react";
import { useId, useMemo, useState, type CSSProperties } from "react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { CustomField, CustomValues } from "@/contracts/production-catalog";

import { hasDuplicateName, matchesQuery, visibleRows } from "../catalog";
import { useCanEditProductionConfig } from "../config-access";
import { formatCustomValue, toCustomValuesPayload, validateCustomValues } from "../custom-fields";
import { productionErrorMessage, toastProductionError } from "../errors";
import { todayIn } from "../format";
import { useClientMutations, useClients, useProductionMe } from "../hooks";
import { emptyListFilters } from "../list-filters";
import { useUrlListFilters } from "../list-filters-hooks";
import type { Client, Tag } from "../types";
import { CustomFieldsForm, CustomFieldValue } from "./custom-field-input";
import { CustomFieldChips, ListFiltersControl } from "./list-filters";
import {
  ActiveState,
  ArchivedToggle,
  CountLabel,
  FormAlert,
  RowMenu,
  RowsSkeleton,
  SearchField,
  SettingsSection
} from "./settings-kit";
import { TagChips, TagPicker } from "./tag-picker";
import { phoneSheetColumn, sheetOnPhone } from "../ui";

const conflict = "Đã có khách hàng cùng tên (không phân biệt hoa thường).";

/**
 * Clients with CLIENT custom fields and tags. Shown both in the Account menu and in the admin
 * configuration area. PD-050: only the organization superadmin adds, edits or archives them; everyone
 * else who opens the list reads it (search, filters and the archived toggle still work; rows open nothing).
 */
export const ClientsPanel = () => {
  const canEdit = useCanEditProductionConfig();
  const me = useProductionMe();
  // CLIENT tags / custom fields, kept in the URL (?tag=…&cf.<key>=…) and filtered by the API.
  const listFilters = useUrlListFilters("CLIENT");
  const filtering = listFilters.count > 0;
  const clients = useClients(listFilters.ready, listFilters.query);
  // Duplicate-name check in the dialog needs every client, not just the filtered ones (same query
  // as `clients` when nothing is filtered). Read-only viewers never open the dialog.
  const allClients = useClients(canEdit);
  const mutations = useClientMutations();
  const [term, setTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ client: Client | null } | null>(null);

  const clientFields = listFilters.fields;
  const columns = clientFields.filter((field) => field.showInTable);
  const tagList = listFilters.tags;
  const items = useMemo(() => clients.data?.items ?? [], [clients.data]);
  const rows = useMemo(
    () =>
      visibleRows(items, showArchived).filter((client) =>
        matchesQuery(
          term,
          client.name,
          client.note,
          ...columns.map((field) => formatCustomValue(field, client.customValues[field.key])),
          ...client.tagIds.map((id) => tagList.find((tag) => tag.id === id)?.name)
        )
      ),
    [items, showArchived, term, columns, tagList]
  );
  const archivedCount = items.filter((client) => !client.active).length;
  const template = [
    "minmax(12rem,1.6fr)",
    "4.5rem",
    "minmax(8rem,1fr)",
    ...columns.map(() => "minmax(7rem,1fr)"),
    "6.5rem",
    ...(canEdit ? ["2.25rem"] : [])
  ].join(" ");

  const toggleActive = (client: Client) =>
    mutations.update.mutate(
      { id: client.id, input: { active: !client.active } },
      {
        onSuccess: () =>
          toast.success(
            client.active ? `Đã lưu trữ ${client.name}` : `Đã khôi phục ${client.name}`
          ),
        onError: (error) => toastProductionError(error, { conflict })
      }
    );

  return (
    <>
      <SettingsSection>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <SearchField
            value={term}
            onChange={setTerm}
            placeholder="Tìm theo tên, ghi chú, tag"
            label="Tìm khách hàng"
            className="basis-full sm:basis-auto"
          />
          <ListFiltersControl
            fields={clientFields}
            tags={tagList}
            filters={listFilters.filters}
            onChange={listFilters.setFilters}
            today={me.data ? todayIn(me.data.settings.timezone) : undefined}
            title="Lọc khách hàng theo trường và tag"
          />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <ArchivedToggle
              checked={showArchived}
              onChange={setShowArchived}
              count={archivedCount}
            />
            {clients.data ? (
              <CountLabel shown={rows.length} total={items.length} noun="khách hàng" />
            ) : null}
            {/* Phones: "Thêm" keeps the filter button, the count and the action on one row. */}
            {canEdit ? (
              <Button className="relative" onClick={() => setDialog({ client: null })}>
                <Plus />
                Thêm<span className="max-sm:sr-only"> khách hàng</span>
              </Button>
            ) : null}
          </div>
        </div>
        {/* relative: keeps the absolutely positioned sr-only header inside this scroller. */}
        <div className="relative overflow-x-auto">
          <div
            className={cn("md:min-w-max", columns.length > 2 && "md:min-w-[56rem]")}
            style={{ "--client-cols": template } as CSSProperties}
          >
            <div className="hidden grid-cols-(--client-cols) gap-4 border-b px-4 py-2.5 text-xs font-medium text-foreground-muted md:grid">
              <span>Khách hàng</span>
              <span className="text-right">Dự án</span>
              <span>Tag</span>
              {columns.map((field) => (
                <span key={field.id} className="truncate" title={field.label}>
                  {field.label}
                </span>
              ))}
              <span>Trạng thái</span>
              {canEdit ? <span className="sr-only">Thao tác</span> : null}
            </div>
            {clients.isPending ? (
              <RowsSkeleton rows={5} />
            ) : clients.isError ? (
              <ErrorState size="sm" error={clients.error} onRetry={() => void clients.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState
                size="sm"
                icon={Building2}
                title={
                  items.length === 0 && !filtering
                    ? "Chưa có khách hàng"
                    : "Không có khách hàng phù hợp"
                }
                description={
                  items.length === 0 && !filtering
                    ? canEdit
                      ? "Thêm khách hàng để gắn với dự án và job."
                      : undefined
                    : filtering
                      ? "Thử bỏ bớt tag hoặc trường đang lọc."
                      : "Thử từ khóa khác hoặc hiện mục đã lưu trữ."
                }
                action={
                  filtering ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => listFilters.setFilters(emptyListFilters)}
                    >
                      Xóa bộ lọc
                    </Button>
                  ) : items.length === 0 && canEdit ? (
                    <Button size="sm" onClick={() => setDialog({ client: null })}>
                      <Plus />
                      Thêm khách hàng
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y">
                {rows.map((client) => (
                  <li
                    key={client.id}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 md:grid-cols-(--client-cols) md:gap-4",
                      !client.active && "bg-muted/30"
                    )}
                  >
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setDialog({ client })}
                        className="flex min-w-0 flex-col items-start rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ClientName client={client} editable />
                      </button>
                    ) : (
                      <div className="flex min-w-0 flex-col items-start">
                        <ClientName client={client} editable={false} />
                      </div>
                    )}
                    {canEdit ? (
                      <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:order-last">
                        <RowMenu
                          label={client.name}
                          active={client.active}
                          onEdit={() => setDialog({ client })}
                          onToggleActive={() => toggleActive(client)}
                        />
                      </span>
                    ) : null}
                    <span className="hidden text-right text-[13px] tabular-nums md:block">
                      {client.projectCount}
                    </span>
                    <span className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
                      <TagChips tags={tagList} tagIds={client.tagIds} />
                      {/* Phones: the custom-field columns as "Label: value" chips. */}
                      <CustomFieldChips
                        fields={clientFields}
                        values={client.customValues}
                        className="md:hidden"
                      />
                    </span>
                    {columns.map((field) => (
                      <span key={field.id} className="hidden min-w-0 text-[13px] md:block">
                        <CustomFieldValue field={field} value={client.customValues[field.key]} />
                      </span>
                    ))}
                    <ActiveState active={client.active} className="hidden md:inline-flex" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SettingsSection>

      {canEdit ? (
        <ClientDialog
          key={dialog?.client?.id ?? "new"}
          open={dialog !== null}
          client={dialog?.client ?? null}
          clients={allClients.data?.items ?? items}
          fields={clientFields}
          tags={tagList}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
};

const ClientName = ({ client, editable }: { client: Client; editable: boolean }) => (
  <>
    <span
      className={cn(
        "max-w-full truncate text-[13px] font-medium",
        editable && "hover:text-brand-text",
        !client.active && "text-foreground-muted"
      )}
    >
      {client.name}
    </span>
    {client.note ? (
      <span className="max-w-full truncate text-xs text-foreground-muted">{client.note}</span>
    ) : null}
  </>
);

const ClientDialog = ({
  open,
  client,
  clients,
  fields,
  tags,
  onClose
}: {
  open: boolean;
  client: Client | null;
  clients: readonly Client[];
  fields: readonly CustomField[];
  tags: readonly Tag[];
  onClose: () => void;
}) => {
  const ids = useId();
  const me = useProductionMe();
  const mutations = useClientMutations();
  const [name, setName] = useState(client?.name ?? "");
  const [note, setNote] = useState(client?.note ?? "");
  const [values, setValues] = useState<CustomValues>(client?.customValues ?? {});
  const [tagIds, setTagIds] = useState<string[]>(client?.tagIds ?? []);
  const [nameError, setNameError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;
  const today = me.data ? todayIn(me.data.settings.timezone) : undefined;

  const submit = () => {
    const trimmed = name.trim();
    const nameProblem = !trimmed
      ? "Nhập tên khách hàng."
      : hasDuplicateName(clients, trimmed, client?.id)
        ? conflict
        : null;
    const problems = validateCustomValues(fields, values, { enforceRequired: true });
    setNameError(nameProblem);
    setFieldErrors(problems);
    if (nameProblem || Object.keys(problems).length > 0) return;
    const input = {
      name: trimmed,
      note: note.trim() || null,
      customValues: toCustomValuesPayload(fields, values),
      tagIds
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(client ? `Đã cập nhật ${trimmed}` : `Đã thêm khách hàng ${trimmed}`);
        onClose();
      },
      onError: (failure: unknown) => setFormError(productionErrorMessage(failure, { conflict }))
    };
    if (client) mutations.update.mutate({ id: client.id, input }, callbacks);
    else mutations.create.mutate(input, callbacks);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl",
          sheetOnPhone
        )}
      >
        <form
          noValidate
          className={cn("flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col", phoneSheetColumn)}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <DialogTitle>{client ? `Sửa ${client.name}` : "Thêm khách hàng"}</DialogTitle>
            <DialogDescription>
              Thông tin dùng chung cho dự án và job của khách hàng này.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <Field data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor={`${ids}-name`}>Tên khách hàng</FieldLabel>
              <Input
                id={`${ids}-name`}
                autoFocus
                value={name}
                maxLength={160}
                aria-invalid={Boolean(nameError)}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
              />
              {nameError ? <FieldError>{nameError}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-note`}>
                Ghi chú <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
              </FieldLabel>
              <Textarea
                id={`${ids}-note`}
                value={note}
                maxLength={2000}
                rows={3}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel id={`${ids}-tags`}>Tag</FieldLabel>
              <TagPicker
                tags={tags}
                value={tagIds}
                onChange={setTagIds}
                aria-label="Tag của khách hàng"
              />
            </Field>
            {fields.length > 0 ? (
              <div className="flex flex-col gap-3 border-t pt-4">
                <p className="text-xs font-semibold tracking-[0.06em] text-foreground-subtle uppercase">
                  Trường tùy chỉnh
                </p>
                <CustomFieldsForm
                  fields={fields}
                  values={values}
                  onChange={(next) => {
                    setValues(next);
                    setFieldErrors({});
                    setFormError(null);
                  }}
                  errors={fieldErrors}
                  idPrefix={ids}
                  today={today}
                />
              </div>
            ) : null}
            <FormAlert>{formError}</FormAlert>
          </div>
          <DialogFooter className="mx-0 mb-0 px-4 py-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {client ? "Lưu thay đổi" : "Thêm khách hàng"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
