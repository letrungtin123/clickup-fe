import { cn } from "cn";
import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Settings,
  Sun,
  UserRound
} from "lucide-react";
import { useNavigate } from "react-router";

import { UserAvatar } from "@/components/shared/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useLogout, useSessionContext } from "@/features/auth/hooks";
import { gradientAccentOptions, solidAccentOptions, type AccentKey } from "@/lib/theme-palettes";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";

import { roleLabel } from "./role-label";

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Theo hệ thống", icon: Monitor }
];

export const OrgMark = ({ name, className }: { name: string; className?: string }) => (
  <span
    aria-hidden="true"
    className={cn(
      "bg-brand-fill flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-brand-foreground shadow-xs",
      className
    )}
  >
    {(name.trim()[0] ?? "N").toLocaleUpperCase("vi")}
  </span>
);

const AccentSwatch = ({ swatch }: { swatch: string }) => (
  <span
    aria-hidden="true"
    className="size-3.5 shrink-0 rounded-full ring-1 ring-foreground/10"
    style={{ background: swatch }}
  />
);

export const UserMenu = ({
  compact = false,
  onNavigate
}: {
  compact?: boolean;
  onNavigate?: (() => void) | undefined;
}) => {
  const session = useSessionContext();
  const navigate = useNavigate();
  const { logout, isPending } = useLogout();
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const accentKey = useThemeStore((state) => state.accentKey);
  const setAccent = useThemeStore((state) => state.setAccent);

  const go = (path: string) => {
    void navigate(path);
    onNavigate?.();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Tài khoản và giao diện"
        className={cn(
          "group flex min-w-0 items-center gap-2 rounded-lg text-left outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-surface-hover",
          compact ? "size-10 justify-center" : "h-10 w-full flex-1 px-1.5"
        )}
      >
        <OrgMark name={session.organization.name} />
        {compact ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold text-foreground">
                {session.organization.name}
              </span>
              <span className="truncate text-xs text-foreground-muted">
                {session.user.displayName}
              </span>
            </span>
            <ChevronsUpDown
              className="size-3.5 shrink-0 text-foreground-subtle"
              aria-hidden="true"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2">
            <UserAvatar user={session.user} size="md" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium text-foreground">
                {session.user.displayName}
              </span>
              <span className="truncate text-xs font-normal">
                {session.user.email ?? roleLabel(session.role)}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go("/settings/profile")}>
          <UserRound />
          Hồ sơ của tôi
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/settings")}>
          <Settings />
          Cài đặt
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {mode === "dark" ? <Moon /> : mode === "light" ? <Sun /> : <Monitor />}
            Giao diện
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(value: ThemeMode) => setMode(value)}
            >
              {themeOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick={false}>
                  <option.icon />
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette />
            Màu nhấn
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-56">
            <DropdownMenuRadioGroup
              value={accentKey}
              onValueChange={(value: AccentKey) => setAccent(value)}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>Màu đơn</DropdownMenuLabel>
                {solidAccentOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.key} value={option.key} closeOnClick={false}>
                    <AccentSwatch swatch={option.swatch} />
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Chuyển sắc</DropdownMenuLabel>
                {gradientAccentOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.key} value={option.key} closeOnClick={false}>
                    <AccentSwatch swatch={option.swatch} />
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={isPending} onClick={logout}>
          <LogOut />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
