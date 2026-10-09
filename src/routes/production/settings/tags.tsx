import { cn } from "cn";
import { Tags } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ColorSwatchPicker } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColorToken } from "@/contracts/work";
import { hasDuplicateName, matchesQuery, visibleRows } from "@/features/production/catalog";
import {
  ActiveState,
  ArchivedToggle,
  CountLabel,
  InlineText,
  PageIntro,
  QuickAdd,
  RowMenu,
  RowsSkeleton,
  SearchField,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { TagChip } from "@/features/production/components/tag-picker";
import { toastProductionError } from "@/features/production/errors";
import { useTagMutations, useTags } from "@/features/production/hooks";
import type { Tag } from "@/features/production/types";
import { colorTokenLabels, toneClass } from "@/lib/colors";

const conflict = "Đã có tag cùng tên (không phân biệt hoa thường).";
const palette: readonly ColorToken[] = [
  "blue",
  "emerald",
  "amber",
  "violet",
  "rose",
  "teal",
  "orange",
  "sky"
];

const ColorButton = ({
  color,
  onChange,
  label
}: {
  color: ColorToken;
  onChange: (color: ColorToken) => void;
  label: string;
}) => (
  <Popover>
    <PopoverTrigger
      aria-label={`${label}: ${colorTokenLabels[color]}`}
      title={colorTokenLabels[color]}
      className={cn(
        toneClass(color),
        "flex size-8 shrink-0 items-center justify-center rounded-lg border outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span aria-hidden="true" className="size-3.5 rounded-full bg-(--tone)" />
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64">
      <ColorSwatchPicker aria-label={label} value={color} onChange={onChange} />
    </PopoverContent>
  </Popover>
);

/** Free tags for jobs, tasks, members and clients (filters in reports). */
export const ProductionTagsRoute = () => {
  const tags = useTags();
  const mutations = useTagMutations();
  const [term, setTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = useMemo(() => tags.data?.items ?? [], [tags.data]);
  const [newColor, setNewColor] = useState<ColorToken | null>(null);
  const color = newColor ?? palette[items.length % palette.length] ?? "blue";
  const rows = useMemo(
    () => visibleRows(items, showArchived).filter((tag) => matchesQuery(term, tag.name)),
    [items, showArchived, term]
  );
  const archivedCount = items.filter((tag) => !tag.active).length;
  const validate = (exceptId: string | null) => (name: string) =>
    hasDuplicateName(items, name, exceptId) ? conflict : null;

  const save = (tag: Tag, input: Partial<Pick<Tag, "name" | "color" | "active">>) =>
    mutations.update.mutate(
      {
        id: tag.id,
        input
      },
      {
        onSuccess: () => {
          setEditingId(null);
          if (input.active !== undefined) {
            toast.success(
              input.active ? `Đã khôi phục tag ${tag.name}` : `Đã lưu trữ tag ${tag.name}`
            );
          }
        },
        onError: (error) => toastProductionError(error, { conflict })
      }
    );

  return (
    <SettingsPage>
      <PageIntro slug="tags" />
      <SettingsSection
        title="Danh sách tag"
        actions={
          <ArchivedToggle checked={showArchived} onChange={setShowArchived} count={archivedCount} />
        }
      >
        <QuickAdd
          label="Tên tag mới"
          placeholder="Tên tag, ví dụ: Gấp"
          buttonLabel="Thêm tag"
          maxLength={60}
          validate={validate(null)}
          onAdd={(name) =>
            mutations.create.mutateAsync({ name, color }).then(
              () => {
                toast.success(`Đã thêm tag ${name}`);
                setNewColor(null);
                return true;
              },
              (error: unknown) => {
                toastProductionError(error, { conflict });
                return false;
              }
            )
          }
        >
          <ColorButton color={color} onChange={setNewColor} label="Màu tag mới" />
        </QuickAdd>
        {items.length > 8 ? (
          <div className="flex items-center gap-3 border-b px-4 py-2.5 md:px-5">
            <SearchField value={term} onChange={setTerm} placeholder="Tìm tag" label="Tìm tag" />
            <CountLabel shown={rows.length} total={items.length} noun="tag" />
          </div>
        ) : null}
        {tags.isPending ? (
          <RowsSkeleton rows={4} />
        ) : tags.isError ? (
          <ErrorState size="sm" error={tags.error} onRetry={() => void tags.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Tags}
            title={items.length === 0 ? "Chưa có tag" : "Không có tag phù hợp"}
            description={
              items.length === 0
                ? "Tag giúp đánh dấu job, task, thành viên hoặc khách hàng để lọc nhanh trong báo cáo."
                : "Thử từ khóa khác hoặc hiện mục đã lưu trữ."
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map((tag) => (
              <li
                key={tag.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 md:px-5",
                  !tag.active && "bg-muted/30"
                )}
              >
                <ColorButton
                  color={tag.color}
                  onChange={(next) => save(tag, { color: next })}
                  label={`Màu của tag ${tag.name}`}
                />
                {editingId === tag.id ? (
                  <InlineText
                    value={tag.name}
                    label={`Tên mới cho tag ${tag.name}`}
                    maxLength={60}
                    validate={validate(tag.id)}
                    pending={mutations.update.isPending}
                    onSubmit={(name) => save(tag, { name })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    title="Bấm để đổi tên"
                    onClick={() => setEditingId(tag.id)}
                    className="flex min-w-0 flex-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <TagChip tag={tag} className="h-6 text-xs" />
                  </button>
                )}
                <ActiveState active={tag.active} className="hidden sm:inline-flex" />
                <RowMenu
                  label={tag.name}
                  active={tag.active}
                  onEdit={() => setEditingId(tag.id)}
                  onToggleActive={() => save(tag, { active: !tag.active })}
                />
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </SettingsPage>
  );
};
