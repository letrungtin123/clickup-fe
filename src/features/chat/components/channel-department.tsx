import { cn } from "cn";
import { UsersRound } from "lucide-react";

import type { NamedChannelKind } from "@/contracts/chat";
import { departmentLabels, type Department } from "@/contracts/departments";
import { departmentIcons, departmentTones } from "@/features/departments/meta";
import { toneClass } from "@/lib/colors";

/**
 * The department a new channel belongs to (PD-054): always the one selected in the header switcher, so this is a note,
 * not a choice. Public channels also say that the whole department is in (PD-053: members added automatically and
 * kept in sync); private channels show only in that department, to the people invited.
 */
export const ChannelDepartmentNote = ({
  department,
  kind,
  fromSwitcher,
  className
}: {
  department: Department | null;
  kind: NamedChannelKind;
  /** The user has a department switcher: name it as the source of the department. */
  fromSwitcher: boolean;
  className?: string;
}) => {
  if (!department && kind === "private") return null;
  const Icon = department ? departmentIcons[department] : UsersRound;
  return (
    <div
      className={cn(
        department && toneClass(departmentTones[department]),
        "flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2.5",
        className
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          department ? "bg-(--tone-soft) text-(--tone-text)" : "bg-muted text-foreground-muted"
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <p className="flex min-w-0 flex-col gap-0.5 text-[13px] leading-snug">
        <span className="text-foreground">
          {department ? (
            <>
              Kênh thuộc phòng ban{" "}
              <span className="font-medium">{departmentLabels[department]}</span>
              {fromSwitcher ? (
                <span className="text-foreground-muted">
                  {" "}
                  (theo phòng ban đang chọn trên thanh trên cùng)
                </span>
              ) : null}
              .
            </>
          ) : (
            "Kênh thuộc phòng ban của bạn."
          )}
        </span>
        <span className="text-xs text-foreground-muted">
          {kind === "public"
            ? "Tất cả thành viên phòng ban sẽ tự động vào kênh và thấy kênh này — người mới vào phòng ban cũng được thêm tự động."
            : "Kênh chỉ hiện trong phòng ban này, với những người được mời."}
        </span>
      </p>
    </div>
  );
};
