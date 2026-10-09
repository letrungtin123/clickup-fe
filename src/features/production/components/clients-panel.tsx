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
import {
  fieldsFor,
  formatCustomValue,
  toCustomValuesPayload,
  validateCustomValues
} from "../custom-fields";
import { productionErrorMessage, toastProductionError } from "../errors";
import { todayIn } from "../format";
import {
  useClientMutations,
  useClients,
  useCustomFields,
  useProductionMe,
  useTags
} from "../hooks";
import type { Client, Tag } from "../types";
import { CustomFieldsForm, CustomFieldValue } from "./custom-field-input";
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
import { sheetOnPhone } from "../ui";

const conflict = "Đã có khách hàng cùng tên (không phân biệt hoa thường).";

/**
 * Clients (PLAN §2: Account creates clients, Admin manages everything) with CLIENT custom fields
 * and tags. Shown both in the Account menu and in the admin configuration area.
 */
export const ClientsPanel = () => {
  const clients = useClients();
  const fields = useCustomFields();
  const tags = useTags();
  const mutations = useClientMutations();
  const [term, setTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ client: Client | null } | null>(null);

  const clientFields = useMemo(() => fieldsFor(fields.data?.items ?? [], "CLIENT"), [fields.data]);
  const columns = clientFields.filter((field) => field.showInTable);
  const tagList = useMemo(() => tags.data?.items ?? [], [tags.data]);
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
    "2.25rem"
  ].join(" ");

  const toggleActive = (client: Client) =>
    mutations.update.mutate(
      { id: client.id, input: { name: client.name, note: client.note, active: !client.active } },
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
            <Button onClick={() => setDialog({ client: null })}>
              <Plus />
              Thêm khách hàng
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div
            className={cn("md:min-w-max", columns.length > 2 && "md:min-w-[56rem]")}
            style={{ "--client-cols": template } as CSSProperties}
          >
            <div className="hidden grid-cols-(--client-cols) gap-4 border-b px-4 py-2.5 text-xs font-medium text-foreground-muted md:grid">
              <span>Khách hàng</span>
              <span className="text-right">Dự án</span>
              <span>Tag</span>
              {columns.map((field) => (
                <span key={field.id} className="truncate">
                  {field.label}
                </span>
              ))}
              <span>Trạng thái</span>
              <span className="sr-only">Thao tác</span>
            </div>
            {clients.isPending ? (
              <RowsSkeleton rows={5} />
            ) : clients.isError ? (
              <ErrorState size="sm" error={clients.error} onRetry={() => void clients.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState
                size="sm"
                icon={Building2}
                title={items.length === 0 ? "Chưa có khách hàng" : "Không có khách hàng phù hợp"}
                description={
                  items.length === 0
                    ? "Thêm khách hàng để gắn với dự án và job."
                    : "Thử từ khóa khác hoặc hiện mục đã lưu trữ."
                }
                action={
                  items.length === 0 ? (
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
                    <button
                      type="button"
                      onClick={() => setDialog({ client })}
                      className="flex min-w-0 flex-col items-start rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        className={cn(
                          "max-w-full truncate text-[13px] font-medium hover:text-brand-text",
                          !client.active && "text-foreground-muted"
                        )}
                      >
                        {client.name}
                      </span>
                      {client.note ? (
                        <span className="max-w-full truncate text-xs text-foreground-muted">
                          {client.note}
                        </span>
                      ) : null}
                    </button>
                    <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:order-last">
                      <RowMenu
                        label={client.name}
                        active={client.active}
                        onEdit={() => setDialog({ client })}
                        onToggleActive={() => toggleActive(client)}
                      />
                    </span>
                    <span className="hidden text-right text-[13px] tabular-nums md:block">
                      {client.projectCount}
                    </span>
                    <span className="col-span-2 min-w-0 md:col-span-1">
                      <TagChips tags={tagList} tagIds={client.tagIds} />
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

      <ClientDialog
        key={dialog?.client?.id ?? "new"}
        open={dialog !== null}
        client={dialog?.client ?? null}
        clients={items}
        fields={clientFields}
        tags={tagList}
        onClose={() => setDialog(null)}
      />
    </>
  );
};

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
          className="flex max-h-[calc(100dvh-2rem)] flex-col"
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
