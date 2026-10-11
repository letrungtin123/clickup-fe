import { cn } from "cn";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { useProductionAccess } from "@/features/production/hooks";
import {
  settingsGroupLabels,
  settingsPageBySlug,
  visibleSettingsPages,
  type SettingsGroup,
  type SettingsPage
} from "@/features/production/nav";
import { useBreakpoint } from "@/hooks/use-breakpoint";

const slugFrom = (pathname: string) =>
  /^\/production\/settings\/([^/]+)/.exec(pathname)?.[1] ?? undefined;

const groupOrder: readonly SettingsGroup[] = ["people", "catalog", "workflow", "system"];

/** /production/settings → first page the user may open. */
export const ProductionSettingsIndexRoute = () => {
  const access = useProductionAccess();
  const first = visibleSettingsPages(access.roles)[0];
  return first ? (
    <Navigate to={`/production/settings/${first.slug}`} replace />
  ) : (
    <RequireProductionRole roles={["ADMIN"]}>{null}</RequireProductionRole>
  );
};

/**
 * Production configuration area: grouped vertical sub-navigation on desktop, a scrollable tab row
 * on tablet/mobile (one tree per tier). Each page is reachable only with its roles (nav.ts).
 */
export const ProductionSettingsLayoutRoute = () => {
  const access = useProductionAccess();
  const breakpoint = useBreakpoint();
  const location = useLocation();
  const pages = visibleSettingsPages(access.roles);
  const current = settingsPageBySlug(slugFrom(location.pathname));
  const desktop = breakpoint === "desktop";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={
          <Link
            to="/production"
            className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3 max-sm:pr-3"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Sản xuất
          </Link>
        }
        title="Cấu hình sản xuất"
        description={
          breakpoint === "mobile"
            ? undefined
            : "Danh mục, đơn giá, luồng trạng thái và quyền của bộ phận sản xuất."
        }
      >
        {!desktop && pages.length > 1 ? <TabsNav pages={pages} /> : null}
      </PageHeader>
      <div className="flex min-h-0 flex-1">
        {desktop && pages.length > 1 ? <SideNav pages={pages} /> : null}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {current ? (
            <RequireProductionRole roles={current.roles}>
              <Outlet />
            </RequireProductionRole>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  );
};

const SideNav = ({ pages }: { pages: readonly SettingsPage[] }) => (
  <nav
    aria-label="Mục cấu hình sản xuất"
    className="w-60 shrink-0 overflow-y-auto border-r bg-canvas/40 px-2 py-4"
  >
    {groupOrder.map((group) => {
      const items = pages.filter((page) => page.group === group);
      if (items.length === 0) return null;
      return (
        <div key={group} className="mb-4 last:mb-0">
          <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase">
            {settingsGroupLabels[group]}
          </p>
          <ul className="flex flex-col gap-px">
            {items.map((page) => (
              <li key={page.slug}>
                <NavLink
                  to={`/production/settings/${page.slug}`}
                  className={({ isActive }) =>
                    cn(
                      "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-foreground/85 outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4 [&_svg]:shrink-0",
                      isActive &&
                        "bg-brand-soft font-medium text-brand-text hover:bg-brand-soft hover:text-brand-text"
                    )
                  }
                >
                  <page.icon aria-hidden="true" />
                  <span className="truncate">{page.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      );
    })}
  </nav>
);

const TabsNav = ({ pages }: { pages: readonly SettingsPage[] }) => {
  const ref = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();
  // Same order as the grouped side navigation (KPI sits with "Con người", not after "Cài đặt chung").
  const ordered = groupOrder.flatMap((group) => pages.filter((page) => page.group === group));
  // Keep the active tab visible when the row overflows (deep links on mobile).
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <nav
      ref={ref}
      aria-label="Mục cấu hình sản xuất"
      // Edge-to-edge row with faded edges: a cut-off tab at the border signals that the row scrolls.
      className="-mx-4 -mb-3 flex scroll-px-6 gap-1 overflow-x-auto px-4 scrollbar-none [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1.5rem),transparent)] md:-mx-6 md:px-6"
    >
      {ordered.map((page) => (
        <NavLink
          key={page.slug}
          to={`/production/settings/${page.slug}`}
          className={({ isActive }) =>
            cn(
              "relative flex h-9 shrink-0 items-center gap-2 rounded-t-md px-3 max-sm:h-10 text-[13px] text-foreground-muted outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent",
              isActive && "font-medium text-foreground after:bg-brand"
            )
          }
        >
          <page.icon className="size-4" aria-hidden="true" />
          {page.label}
        </NavLink>
      ))}
    </nav>
  );
};
