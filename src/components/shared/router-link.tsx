import { cn } from "cn";
import type {
  AnchorHTMLAttributes,
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  Ref
} from "react";
import {
  type RelativeRoutingType,
  type To,
  useHref,
  useLocation,
  useNavigate,
  useResolvedPath
} from "react-router";

/**
 * Drop-in replacements for react-router's `Link` / `NavLink` that render an anchor WITHOUT `href`.
 * Desktop browsers show the target URL in a status pill (bottom-left) for every hovered `<a href>`; the
 * owner found that distracting, so in-app links navigate through the router instead. What a real link
 * offers is kept: role "link", keyboard focus, Enter, Ctrl/Cmd/Shift-click and middle-click open a new
 * tab, `target="_blank"` too. Only the browser's own "copy link address" context menu entry is lost.
 * External URLs, downloads and in-page anchors keep plain `<a href>`.
 */
type LinkOwnProps = {
  to: To;
  replace?: boolean | undefined;
  state?: unknown;
  relative?: RelativeRoutingType | undefined;
  preventScrollReset?: boolean | undefined;
  viewTransition?: boolean | undefined;
  ref?: Ref<HTMLAnchorElement> | undefined;
};
export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & LinkOwnProps;

const wantsNewTab = (event: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) =>
  event.metaKey || event.ctrlKey || event.shiftKey || ("button" in event && event.button === 1);

const openInNewTab = (href: string) => {
  window.open(href, "_blank", "noopener");
};

export const Link = ({
  to,
  replace,
  state,
  relative,
  preventScrollReset,
  viewTransition,
  target,
  role,
  tabIndex,
  className,
  onClick,
  onAuxClick,
  onKeyDown,
  ref,
  children,
  ...rest
}: LinkProps) => {
  const navigate = useNavigate();
  const href = useHref(to, relative ? { relative } : undefined);
  const go = () => {
    void navigate(to, {
      ...(replace === undefined ? {} : { replace }),
      ...(state === undefined ? {} : { state }),
      ...(relative === undefined ? {} : { relative }),
      ...(preventScrollReset === undefined ? {} : { preventScrollReset }),
      ...(viewTransition === undefined ? {} : { viewTransition })
    });
  };
  return (
    <a
      {...rest}
      ref={ref}
      role={role ?? "link"}
      tabIndex={tabIndex ?? 0}
      data-to={href}
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (target === "_blank" || wantsNewTab(event)) openInNewTab(href);
        else go();
      }}
      onAuxClick={(event) => {
        onAuxClick?.(event);
        if (event.defaultPrevented || event.button !== 1) return;
        event.preventDefault();
        openInNewTab(href);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== "Enter") return;
        event.preventDefault();
        if (target === "_blank" || event.metaKey || event.ctrlKey) openInNewTab(href);
        else go();
      }}
    >
      {children}
    </a>
  );
};

type NavLinkRenderProps = { isActive: boolean; isPending: boolean; isTransitioning: boolean };
export type NavLinkProps = Omit<LinkProps, "className" | "style" | "children"> & {
  end?: boolean | undefined;
  caseSensitive?: boolean | undefined;
  className?: string | ((props: NavLinkRenderProps) => string | undefined) | undefined;
  style?: CSSProperties | ((props: NavLinkRenderProps) => CSSProperties | undefined) | undefined;
  children?: ReactNode | ((props: NavLinkRenderProps) => ReactNode) | undefined;
};

/** Same active rule as react-router's NavLink ("/a" is active on "/a" and "/a/…", `end` = exact). */
export const NavLink = ({
  to,
  end = false,
  caseSensitive = false,
  relative,
  className,
  style,
  children,
  ...rest
}: NavLinkProps) => {
  const location = useLocation();
  const path = useResolvedPath(to, relative ? { relative } : undefined);
  let current = location.pathname;
  let target = path.pathname;
  if (!caseSensitive) {
    current = current.toLowerCase();
    target = target.toLowerCase();
  }
  const slash = target !== "/" && target.endsWith("/") ? target.length - 1 : target.length;
  const isActive =
    current === target || (!end && current.startsWith(target) && current.charAt(slash) === "/");
  const state: NavLinkRenderProps = { isActive, isPending: false, isTransitioning: false };
  return (
    <Link
      {...rest}
      to={to}
      relative={relative}
      aria-current={isActive ? "page" : undefined}
      className={
        typeof className === "function" ? className(state) : cn(className, isActive && "active")
      }
      style={typeof style === "function" ? style(state) : style}
    >
      {typeof children === "function" ? children(state) : children}
    </Link>
  );
};
