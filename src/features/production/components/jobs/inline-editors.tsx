import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { DoneQtyDraft, QtyRequestDraft } from "../../task-edit-model";
import type { InlineEditorProps } from "./inline-field";

/** Editors shared by the task fields and the subtask rows (PD-044 inline editing). */

/** One-line number box ("Số lượng giao", "Hình lỗi", "Giờ OT"): Enter saves (InlineField). */
export const NumberEditor = ({
  id,
  value,
  onChange,
  invalid,
  disabled,
  decimal = false,
  placeholder
}: InlineEditorProps<string> & { decimal?: boolean; placeholder?: string }) => (
  <Input
    id={id}
    inputMode={decimal ? "decimal" : "numeric"}
    autoComplete="off"
    value={value}
    disabled={disabled}
    aria-invalid={invalid}
    placeholder={placeholder}
    onChange={(event) => onChange(event.target.value)}
    className="tabular-nums sm:max-w-48"
  />
);

/**
 * "Số tấm đã xong" after Done: the number and why it changes — required when someone other than the worker corrects
 * it (the worker is notified), optional for the worker.
 */
export const DoneQtyEditor = ({
  id,
  value,
  onChange,
  invalid,
  disabled,
  noteRequired
}: InlineEditorProps<DoneQtyDraft> & { noteRequired: boolean }) => (
  <div className="flex flex-col gap-2">
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      value={value.qty}
      disabled={disabled}
      aria-invalid={invalid}
      onChange={(event) => onChange({ ...value, qty: event.target.value })}
      className="tabular-nums sm:max-w-48"
    />
    <label htmlFor={`${id}-note`} className="text-xs font-medium text-foreground">
      Lý do{" "}
      {noteRequired ? null : (
        <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
      )}
    </label>
    <Textarea
      id={`${id}-note`}
      rows={2}
      maxLength={5000}
      value={value.note}
      disabled={disabled}
      placeholder={noteRequired ? "Người làm sẽ nhận thông báo kèm lý do này" : undefined}
      onChange={(event) => onChange({ ...value, note: event.target.value })}
    />
  </div>
);

/**
 * "Số lượng giao" when the worker may only ask (PD-044, inline since PD-047): the new total ("Số lượng mới", Enter
 * sends) and the reason the Leader decides on (required). `problems`: the fields to mark once a send was refused.
 */
export const QtyRequestEditor = ({
  id,
  value,
  onChange,
  invalid,
  disabled,
  problems
}: InlineEditorProps<QtyRequestDraft> & {
  problems: Partial<Record<"qty" | "reason", string>>;
}) => (
  <div className="flex flex-col gap-2">
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      value={value.qty}
      disabled={disabled}
      aria-invalid={invalid && Boolean(problems.qty)}
      onChange={(event) => onChange({ ...value, qty: event.target.value })}
      className="tabular-nums sm:max-w-48"
    />
    <label htmlFor={`${id}-reason`} className="text-xs font-medium text-foreground">
      Lý do
    </label>
    <Textarea
      id={`${id}-reason`}
      rows={2}
      maxLength={2000}
      value={value.reason}
      disabled={disabled}
      aria-invalid={invalid && Boolean(problems.reason)}
      placeholder="Ví dụ: thư mục có thêm 2 tấm khách gửi bổ sung…"
      onChange={(event) => onChange({ ...value, reason: event.target.value })}
    />
  </div>
);
