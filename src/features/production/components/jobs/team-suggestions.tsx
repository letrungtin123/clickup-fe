import { cn } from "cn";
import { Sparkles, Users } from "lucide-react";
import { useState } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import type { TeamMemberLoad } from "@/contracts/production-overview";
import { toneClass } from "@/lib/colors";

import {
  groupTeam,
  leaveLabel,
  loadLabel,
  loadTag,
  shortName,
  suggestAssignees,
  unavailable
} from "../../team-load";

type Project = { id: string; code: string };

/** One person as a tile: avatar, short name, load; the tag "Rảnh" / "Đang làm <code>"; greyed when on leave. */
const PersonTile = ({
  member,
  project,
  onPick,
  className
}: {
  member: TeamMemberLoad;
  project: Project;
  onPick: (personId: string) => void;
  className?: string;
}) => {
  const away = unavailable(member);
  const tag = away ? null : loadTag(member, project);
  const load = loadLabel(member);
  const leave = leaveLabel(member.leave);
  return (
    <button
      type="button"
      disabled={away}
      onClick={() => onPick(member.user.id)}
      title={`${member.user.displayName} · ${away ? leave : load}`}
      aria-label={`${member.user.displayName} · ${away ? leave : load}${tag?.kind === "project" ? ` · ${tag.label}` : ""}`}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border bg-surface px-2.5 py-1.5 text-left shadow-xs transition-colors outline-none pointer-coarse:min-h-11",
        "hover:border-border-strong hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:bg-surface",
        className
      )}
    >
      <UserAvatar user={member.user} size="sm" className={cn(away && "grayscale")} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] font-medium">{shortName(member.user.displayName)}</span>
        <span
          className={cn(
            "truncate text-xs tabular-nums",
            away ? "text-warning" : load === "Rảnh" ? "text-success" : "text-foreground-muted"
          )}
        >
          {away ? leave : load}
        </span>
      </span>
      {tag ? (
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
            tag.kind === "free"
              ? "bg-success-soft text-success"
              : cn(toneClass("blue"), "bg-(--tone-soft) text-(--tone-text)")
          )}
        >
          {tag.label}
        </span>
      ) : null}
    </button>
  );
};

/**
 * PD-080 "Gợi ý" of "Chia task": 3–5 people for the job's project — Rảnh first, then people already on the project (fewest
 * images first), then the lightest — each a tile; a click hands that person a task card. "Xem cả team" shows everyone the
 * line may take as the same tiles, grouped Rảnh · Đang làm <code> · Khác · Đang nghỉ (greyed, not clickable), wrapping
 * with the width and scrolling past ~280 px.
 */
export const TeamSuggestions = ({
  members,
  project,
  eligibleIds,
  onPick
}: {
  members: readonly TeamMemberLoad[];
  project: Project;
  /** People a work task may go to (the non-Checking picker's list). */
  eligibleIds: ReadonlySet<string>;
  onPick: (personId: string) => void;
}) => {
  const [showTeam, setShowTeam] = useState(false);
  const suggested = suggestAssignees(members, project.id, eligibleIds);
  const groups = groupTeam(members, project, eligibleIds);
  const free = groups.find((group) => group.key === "free")?.members.length ?? 0;
  const away = groups.find((group) => group.key === "leave")?.members.length ?? 0;
  const teamId = `team-${project.id}`;
  return (
    <section
      aria-label={`Gợi ý cho ${project.code}`}
      className="flex min-w-0 flex-col gap-2.5 rounded-xl border bg-muted/30 p-3"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles className="size-3.5 text-brand-text" aria-hidden="true" />
          Gợi ý cho {project.code}
        </h3>
        <p className="text-xs text-foreground-muted">
          Rảnh trước · rồi người đang làm {project.code} · rồi người ít việc nhất · bấm để thêm task
        </p>
      </div>
      {suggested.length > 0 ? (
        <ul className="flex min-w-0 flex-wrap gap-2" aria-label="Người được gợi ý">
          {suggested.map((member) => (
            <li key={member.user.id} className="max-w-full min-w-0">
              <PersonTile member={member} project={project} onPick={onPick} className="max-w-full" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-foreground-muted">Không còn ai rảnh để gợi ý — xem cả team.</p>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={showTeam}
          aria-controls={teamId}
          onClick={() => setShowTeam((value) => !value)}
        >
          <Users />
          {showTeam ? "Ẩn cả team" : `Xem cả team (${free} rảnh · ${away} đang nghỉ)`}
        </Button>
      </div>
      {showTeam ? (
        <div
          id={teamId}
          className="flex max-h-72 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1"
        >
          {groups.map((group) => (
            <div key={group.key} className="flex min-w-0 flex-col gap-1.5">
              <h4 className="text-[11px] font-semibold tracking-wide text-foreground-muted uppercase">
                {group.title} · {group.members.length}
              </h4>
              <ul
                aria-label={group.title}
                className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,11.5rem),1fr))] gap-2"
              >
                {group.members.map((member) => (
                  <li key={member.user.id} className="min-w-0">
                    <PersonTile member={member} project={project} onPick={onPick} className="w-full" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};
