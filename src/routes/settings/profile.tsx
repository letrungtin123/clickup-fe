import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { UserAvatar } from "@/components/shared/user-avatar";
import { roleLabel } from "@/components/layout/role-label";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { useLogout, useSessionContext } from "@/features/auth/hooks";
import {
  gradientAccentOptions,
  solidAccentOptions,
  type AccentPalette
} from "@/lib/theme-palettes";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";

const Card = ({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-xl border bg-surface shadow-xs">
    <div className="border-b px-5 py-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? (
        <p className="mt-0.5 text-[13px] text-foreground-muted">{description}</p>
      ) : null}
    </div>
    <div className="px-5 py-5">{children}</div>
  </section>
);

export const ProfileSettingsRoute = () => {
  const session = useSessionContext();
  const { logout } = useLogout();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
      <Card title="Hồ sơ">
        <div className="flex items-center gap-4">
          <UserAvatar user={session.user} size="lg" />
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
            <dt className="text-foreground-muted">Họ tên</dt>
            <dd className="truncate font-medium">{session.user.displayName}</dd>
            <dt className="text-foreground-muted">Email</dt>
            <dd className="truncate">{session.user.email ?? "—"}</dd>
            <dt className="text-foreground-muted">Vai trò</dt>
            <dd className="truncate">
              {roleLabel(session.role)} · {session.organization.name}
            </dd>
          </dl>
        </div>
      </Card>

      <AppearanceCard />

      <Card
        title="Đổi mật khẩu"
        description="Sau khi đổi, các phiên đăng nhập khác của bạn sẽ bị đăng xuất."
      >
        <div className="max-w-sm">
          <ChangePasswordForm
            onChanged={({ reauthenticate }) => {
              if (reauthenticate) {
                toast.success("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
                logout();
                return;
              }
              toast.success("Đã đổi mật khẩu");
            }}
          />
        </div>
      </Card>
    </div>
  );
};

const AppearanceCard = () => {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const accentKey = useThemeStore((state) => state.accentKey);
  const setAccent = useThemeStore((state) => state.setAccent);

  const swatches = (options: readonly AccentPalette[], label: string) => (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-foreground-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.key === accentKey;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              title={option.label}
              onClick={() => setAccent(option.key)}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-surface transition-transform duration-150 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
                checked && "ring-2 ring-foreground/60"
              )}
              style={{ background: option.swatch }}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <Card title="Giao diện" description="Lưu trên thiết bị này.">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground-muted">Chế độ</p>
          <SegmentedControl<ThemeMode>
            aria-label="Chế độ giao diện"
            value={mode}
            onChange={setMode}
            className="w-full sm:w-fit"
            options={[
              { value: "light", label: "Sáng", icon: Sun },
              { value: "dark", label: "Tối", icon: Moon },
              { value: "system", label: "Hệ thống", icon: Monitor }
            ]}
          />
        </div>
        {swatches(solidAccentOptions, "Màu nhấn đơn sắc")}
        {swatches(gradientAccentOptions, "Màu nhấn chuyển sắc")}
      </div>
    </Card>
  );
};
