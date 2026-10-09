import { cn } from "cn";
import { ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";
import { Navigate, NavLink, Outlet } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { P } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";

type SettingsNavItem = { to: string; label: string; icon: LucideIcon; visible: boolean };

const useSettingsNav = (): SettingsNavItem[] => {
  const { can } = usePermissions();
  return [
    { to: "/settings/profile", label: "Hồ sơ và giao diện", icon: UserRound, visible: true },
    { to: "/settings/members", label: "Thành viên", icon: Users, visible: can(P.MemberView) },
    {
      to: "/settings/roles",
      label: "Vai trò và quyền",
      icon: ShieldCheck,
      visible: can(P.RoleView) || can(P.MemberManage)
    }
  ];
};

export const SettingsIndexRoute = () => {
  const items = useSettingsNav().filter((item) => item.visible);
  return (
    <Navigate
      to={items.find((item) => item.to !== "/settings/profile")?.to ?? "/settings/profile"}
      replace
    />
  );
};

export const SettingsLayoutRoute = () => {
  const items = useSettingsNav().filter((item) => item.visible);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Cài đặt" description="Tài khoản của bạn và cấu hình tổ chức.">
        <nav aria-label="Mục cài đặt" className="-mb-3 flex gap-1 overflow-x-auto scrollbar-none">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative flex h-9 shrink-0 items-center gap-2 rounded-t-md px-3 text-[13px] text-foreground-muted outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent",
                  isActive && "font-medium text-foreground after:bg-brand"
                )
              }
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
};
