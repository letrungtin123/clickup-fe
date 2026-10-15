import { readDesktopPermission } from "./support";

/**
 * Shows one OS notification (PD-055). Never throws: a refused permission, a browser that only notifies through a
 * service worker (Android) or any other failure just means no pop-up.
 */

let cachedIcon: string | null | undefined;

/**
 * The brand square with its "N" (same as public/favicon.svg) as a PNG data URL, drawn once: Windows does not render
 * SVG notification icons.
 */
export const brandIconDataUrl = (doc: Document = document): string | null => {
  if (cachedIcon !== undefined) return cachedIcon;
  cachedIcon = null;
  try {
    const canvas = doc.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#0e8a5f";
    ctx.beginPath();
    ctx.roundRect(0, 0, 128, 128, 28);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 80px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 64, 70);
    cachedIcon = canvas.toDataURL("image/png");
  } catch {
    cachedIcon = null;
  }
  return cachedIcon;
};

export type ShowInput = {
  title: string;
  body: string;
  tag: string;
  /** Runs after the pop-up is clicked (the app window is focused first). */
  onClick?: (() => void) | undefined;
};

export const showDesktopNotification = ({ title, body, tag, onClick }: ShowInput): Notification | null => {
  if (readDesktopPermission() !== "granted") return null;
  try {
    const icon = brandIconDataUrl();
    const notification = new window.Notification(title, {
      body,
      tag,
      lang: "vi",
      silent: false,
      ...(icon ? { icon } : {})
    });
    notification.onclick = (event) => {
      event.preventDefault();
      try {
        window.focus();
      } catch {
        // Some browsers refuse focus(); the click still navigates.
      }
      notification.close();
      onClick?.();
    };
    return notification;
  } catch {
    return null;
  }
};
