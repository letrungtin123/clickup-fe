import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { colorForId, initialsOf, toneClass } from "@/lib/colors";

export type AvatarUser = {
  id: string;
  displayName: string;
  avatarUrl?: string | null | undefined;
};

type Size = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm"
};

const presenceSizes: Record<Size, string> = {
  xs: "size-1.5",
  sm: "size-2",
  md: "size-2.5",
  lg: "size-3"
};

type UserAvatarProps = {
  user: AvatarUser;
  size?: Size;
  className?: string;
  /** undefined = presence unknown (no indicator). */
  online?: boolean | undefined;
  showTooltip?: boolean;
};

/** Initials on a deterministic color (or the avatar image when the API provides one). */
export const UserAvatar = ({
  user,
  size = "sm",
  className,
  online,
  showTooltip = false
}: UserAvatarProps) => {
  const avatar = (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight select-none",
        toneClass(colorForId(user.id)),
        "bg-(--tone-soft) text-(--tone-text)",
        sizeClasses[size],
        className
      )}
      role="img"
      aria-label={user.displayName}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="size-full rounded-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span aria-hidden="true">{initialsOf(user.displayName)}</span>
      )}
      {online === undefined ? null : (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-px -bottom-px rounded-full ring-2 ring-background",
            presenceSizes[size],
            online ? "bg-success" : "bg-foreground-subtle"
          )}
        />
      )}
    </span>
  );

  if (!showTooltip) {
    return avatar;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{avatar}</TooltipTrigger>
      <TooltipContent>{user.displayName}</TooltipContent>
    </Tooltip>
  );
};

type AvatarGroupProps = {
  users: readonly AvatarUser[];
  max?: number;
  size?: Size;
  className?: string;
};

/**
 * How far neighbours tuck under each other. Small initials need most of the circle to stay legible
 * ("ĐA NB", not "Đ‹NB"), so the smaller sizes barely overlap (P6).
 */
const overlapClasses: Record<Size, string> = {
  xs: "-space-x-0.5",
  sm: "-space-x-1",
  md: "-space-x-1.5",
  lg: "-space-x-1.5"
};

/** Overlapping avatars with a "+N" overflow chip listing the hidden names. */
export const AvatarGroup = ({ users, max = 3, size = "sm", className }: AvatarGroupProps) => {
  const visible = users.slice(0, max);
  const hidden = users.slice(max);
  return (
    <div className={cn("flex items-center", overlapClasses[size], className)}>
      {visible.map((user) => (
        <UserAvatar
          key={user.id}
          user={user}
          size={size}
          showTooltip
          className="ring-2 ring-background"
        />
      ))}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  "relative inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground-muted ring-2 ring-background select-none",
                  sizeClasses[size]
                )}
              />
            }
          >
            +{hidden.length}
          </TooltipTrigger>
          <TooltipContent>{hidden.map((user) => user.displayName).join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
};
