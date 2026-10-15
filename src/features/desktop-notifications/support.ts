/**
 * Can this page show OS notifications? (PD-055)
 *   supported    desktop browser, secure context (HTTPS / localhost), Notification API present;
 *   mobile       phones and tablets: browsers there only notify through a service worker / installed app, which the
 *                app does not use — the bell and the unread badges do the job;
 *   insecure     plain http: browsers expose no Notification permission there;
 *   unsupported  an old or locked-down browser without the API.
 */
export type DesktopSupport = "supported" | "mobile" | "insecure" | "unsupported";

export type SupportEnv = {
  hasNotification: boolean;
  secure: boolean;
  userAgent: string;
  maxTouchPoints: number;
  /** navigator.userAgentData.mobile where the browser exposes it. */
  uaMobile?: boolean | undefined;
};

const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile|Silk/i;

export const isMobileDevice = (env: Pick<SupportEnv, "userAgent" | "maxTouchPoints" | "uaMobile">) =>
  env.uaMobile === true ||
  mobileUa.test(env.userAgent) ||
  // iPadOS reports a desktop Safari user agent but has a touch screen.
  (/Macintosh/i.test(env.userAgent) && env.maxTouchPoints > 1);

export const detectDesktopSupport = (env: SupportEnv): DesktopSupport => {
  if (isMobileDevice(env)) return "mobile";
  if (!env.secure) return "insecure";
  if (!env.hasNotification) return "unsupported";
  return "supported";
};

export const browserSupportEnv = (): SupportEnv => {
  if (typeof window === "undefined") {
    return { hasNotification: false, secure: false, userAgent: "", maxTouchPoints: 0 };
  }
  const nav = window.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return {
    hasNotification: "Notification" in window,
    secure: window.isSecureContext,
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints || 0,
    uaMobile: nav.userAgentData?.mobile
  };
};

export const browserDesktopSupport = () => detectDesktopSupport(browserSupportEnv());

export type DesktopPermission = NotificationPermission | "unsupported";

export const readDesktopPermission = (): DesktopPermission => {
  try {
    return typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "unsupported";
  } catch {
    return "unsupported";
  }
};

/** Fired in this tab after a permission request settles (browsers have no permission event of their own everywhere). */
export const PERMISSION_CHANGED_EVENT = "nesso:desktop-notify-permission";

/**
 * Asks the browser for permission. Must be called straight from a click handler (user gesture). Never throws;
 * resolves with the resulting permission.
 */
export const requestDesktopPermission = async (): Promise<DesktopPermission> => {
  if (readDesktopPermission() === "unsupported") return "unsupported";
  try {
    await window.Notification.requestPermission();
  } catch {
    // Treated as "still default / denied" below.
  }
  window.dispatchEvent(new Event(PERMISSION_CHANGED_EVENT));
  return readDesktopPermission();
};
