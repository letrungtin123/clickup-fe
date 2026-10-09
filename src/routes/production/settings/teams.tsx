import { cn } from "cn";
import { Network } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/shared/states";
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
import { toastProductionError } from "@/features/production/errors";
import { useTeamMutations, useTeams } from "@/features/production/hooks";
import type { Team } from "@/features/production/types";

const conflict = "Đã có team cùng tên (không phân biệt hoa thường).";

/** Teams are report labels only (PD-011): any Leader can still assign work to anyone. */
export const ProductionTeamsRoute = () => {
  const teams = useTeams();
  const mutations = useTeamMutations();
  const [term, setTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = useMemo(() => teams.data?.items ?? [], [teams.data]);
  const rows = useMemo(
    () => visibleRows(items, showArchived).filter((team) => matchesQuery(term, team.name)),
    [items, showArchived, term]
  );
  const archivedCount = items.filter((team) => !team.active).length;

  const validate = (exceptId: string | null) => (name: string) =>
    hasDuplicateName(items, name, exceptId) ? conflict : null;

  const save = (team: Team, input: { name?: string; active?: boolean }) =>
    mutations.update.mutate(
      {
        id: team.id,
        input: { name: input.name ?? team.name, active: input.active ?? team.active }
      },
      {
        onSuccess: () => {
          setEditingId(null);
          if (input.active !== undefined) {
            toast.success(
              input.active ? `Đã khôi phục team ${team.name}` : `Đã lưu trữ team ${team.name}`
            );
          }
        },
        onError: (error) => toastProductionError(error, { conflict })
      }
    );

  return (
    <SettingsPage>
      <PageIntro slug="teams" />
      <SettingsSection
        title="Danh sách team"
        actions={
          <>
            <ArchivedToggle
              checked={showArchived}
              onChange={setShowArchived}
              count={archivedCount}
            />
          </>
        }
      >
        <QuickAdd
          label="Tên team mới"
          placeholder="Tên team, ví dụ: Team Sáng"
          buttonLabel="Thêm team"
          maxLength={120}
          validate={validate(null)}
          onAdd={(name) =>
            mutations.create.mutateAsync({ name }).then(
              () => {
                toast.success(`Đã thêm team ${name}`);
                return true;
              },
              (error: unknown) => {
                toastProductionError(error, { conflict });
                return false;
              }
            )
          }
        />
        {items.length > 6 ? (
          <div className="flex items-center gap-3 border-b px-4 py-2.5 md:px-5">
            <SearchField value={term} onChange={setTerm} placeholder="Tìm team" label="Tìm team" />
            <CountLabel shown={rows.length} total={items.length} noun="team" />
          </div>
        ) : null}
        {teams.isPending ? (
          <RowsSkeleton rows={4} />
        ) : teams.isError ? (
          <ErrorState size="sm" error={teams.error} onRetry={() => void teams.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Network}
            title={items.length === 0 ? "Chưa có team" : "Không có team phù hợp"}
            description={
              items.length === 0
                ? "Tạo team để gom nhóm thành viên khi xem báo cáo điểm và năng suất."
                : "Thử từ khóa khác hoặc hiện mục đã lưu trữ."
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map((team) => (
              <li
                key={team.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 md:px-5",
                  !team.active && "bg-muted/30"
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground-muted">
                  <Network className="size-3.5" aria-hidden="true" />
                </span>
                {editingId === team.id ? (
                  <InlineText
                    value={team.name}
                    label={`Tên mới cho team ${team.name}`}
                    maxLength={120}
                    validate={validate(team.id)}
                    pending={mutations.update.isPending}
                    onSubmit={(name) => save(team, { name })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingId(team.id)}
                    title="Bấm để đổi tên"
                    className={cn(
                      "min-w-0 flex-1 truncate rounded text-left text-[13px] font-medium outline-none hover:text-brand-text focus-visible:ring-2 focus-visible:ring-ring",
                      !team.active && "text-foreground-muted"
                    )}
                  >
                    {team.name}
                  </button>
                )}
                <span className="hidden text-xs text-foreground-muted tabular-nums sm:inline">
                  {team.memberCount} thành viên
                </span>
                <ActiveState active={team.active} className="hidden sm:inline-flex" />
                <RowMenu
                  label={team.name}
                  active={team.active}
                  onEdit={() => setEditingId(team.id)}
                  onToggleActive={() => save(team, { active: !team.active })}
                />
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </SettingsPage>
  );
};
