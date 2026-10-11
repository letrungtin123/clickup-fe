import { cn } from "cn";
import { Check, UserRoundSearch } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { customFieldEmptyValue } from "@/contracts/production-catalog";
import { toneClass } from "@/lib/colors";

import { useCustomFields, useTags } from "../../hooks";
import { touchTargets } from "../../ui";
import {
  peopleFilterCount,
  peopleFilterFields,
  toggleFieldValue,
  toggleTag,
  type PeopleFilter
} from "../people-filter";

const Choice = ({
  label,
  pressed,
  color,
  onClick
}: {
  label: string;
  pressed: boolean;
  color?: string | undefined;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className={cn(
      "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10",
      pressed
        ? "border-brand/50 bg-brand-soft text-foreground"
        : "text-foreground-muted hover:border-border-strong hover:text-foreground"
    )}
  >
    {pressed ? (
      <Check className="size-3.5 shrink-0" aria-hidden="true" />
    ) : color ? (
      <span
        aria-hidden="true"
        className={cn(toneClass(color), "size-2 shrink-0 rounded-full bg-(--tone)")}
      />
    ) : null}
    {label}
  </button>
);

/**
 * "Lọc nhân viên" (ADMIN): members' custom fields (e.g. Năng lực A++/A/B) and tags, for the KPI report
 * and the score board. Values of one field match any of them; fields and tags combine with AND.
 */
export const PeopleFilterButton = ({
  value,
  onChange,
  className
}: {
  value: PeopleFilter;
  onChange: (value: PeopleFilter) => void;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const customFields = useCustomFields();
  const tags = useTags();
  const fields = peopleFilterFields(customFields.data?.items ?? []);
  const tagItems = (tags.data?.items ?? []).filter(
    (tag) => tag.active || value.tagIds.includes(tag.id)
  );
  const count = peopleFilterCount(value);
  const valuesOf = (key: string) => value.fields.find((field) => field.key === key)?.values ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(count > 0 && "border-brand/40 bg-brand-soft", className)}
            aria-label={count > 0 ? `Lọc nhân viên: ${count} điều kiện` : "Lọc nhân viên"}
          />
        }
      >
        <UserRoundSearch />
        <span>Lọc nhân viên</span>
        {count > 0 ? (
          <span className="min-w-5 rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "flex max-h-[min(32rem,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col p-0",
          touchTargets
        )}
      >
        <div className="flex flex-col gap-0.5 border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Lọc nhân viên</p>
          <p className="text-xs text-foreground-muted">
            Theo trường của nhân viên và tag. Chọn nhiều giá trị của một trường là "hoặc".
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
          {fields.length === 0 && tagItems.length === 0 ? (
            <p className="text-xs text-foreground-muted">
              Chưa có trường chọn hoặc tag nào cho nhân viên. Tạo ở Cấu hình › Trường tùy chỉnh.
            </p>
          ) : null}
          {fields.map((field) => {
            const selected = valuesOf(field.key);
            return (
              <fieldset key={field.id} className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-xs font-medium text-foreground-muted">
                  {field.label}
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ...field.options,
                    { value: customFieldEmptyValue, label: "Chưa có", color: undefined }
                  ].map((option) => (
                    <Choice
                      key={option.value}
                      label={option.label}
                      color={option.color}
                      pressed={selected.includes(option.value)}
                      onClick={() => onChange(toggleFieldValue(value, field.key, option.value))}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
          {tagItems.length > 0 ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-medium text-foreground-muted">
                Tag của nhân viên
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {tagItems.map((tag) => (
                  <Choice
                    key={tag.id}
                    label={tag.name}
                    color={tag.color}
                    pressed={value.tagIds.includes(tag.id)}
                    onClick={() => onChange(toggleTag(value, tag.id))}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
        <div className="flex items-center gap-1 border-t p-1.5">
          <span className="flex-1 px-1.5 text-xs text-foreground-muted">
            {count > 0 ? `Đang lọc ${count} điều kiện` : "Chưa lọc — mọi nhân viên"}
          </span>
          {count > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onChange({ tagIds: [], fields: [] })}>
              Bỏ lọc
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Xong
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
