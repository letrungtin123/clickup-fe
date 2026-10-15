// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { showDesktopNotification } from "./show";
import { readDesktopPermission, requestDesktopPermission } from "./support";

type Created = { title: string; options: NotificationOptions; close: ReturnType<typeof vi.fn>; onclick: unknown };

/** Minimal Notification stand-in: records what was shown. */
const installNotification = (permission: NotificationPermission, { throws = false } = {}) => {
  const created: Created[] = [];
  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(() => {
      FakeNotification.permission = "granted";
      return Promise.resolve<NotificationPermission>("granted");
    });
    title: string;
    options: NotificationOptions;
    close = vi.fn();
    onclick: ((event: Event) => void) | null = null;
    constructor(title: string, options: NotificationOptions = {}) {
      if (throws) throw new TypeError("Illegal constructor");
      this.title = title;
      this.options = options;
      created.push(this);
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  // jsdom has no canvas: the brand icon is simply left out.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  return { created, FakeNotification };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("showing an OS notification", () => {
  it("shows with the tag, body and sound when granted; a click focuses the app, closes and navigates", () => {
    const { created } = installNotification("granted");
    const focus = vi.spyOn(window, "focus").mockImplementation(() => undefined);
    const onClick = vi.fn();
    const shown = showDesktopNotification({ title: "An", body: "Chào", tag: "chat:m1", onClick });
    expect(shown).not.toBeNull();
    expect(created).toHaveLength(1);
    expect(created[0]?.title).toBe("An");
    expect(created[0]?.options).toMatchObject({ body: "Chào", tag: "chat:m1", silent: false });
    const handler = created[0]?.onclick as (event: Event) => void;
    handler(new Event("click"));
    expect(focus).toHaveBeenCalled();
    expect(created[0]?.close).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does nothing (and never throws) when the permission is not granted", () => {
    const { created } = installNotification("denied");
    expect(showDesktopNotification({ title: "An", body: "Chào", tag: "chat:m2" })).toBeNull();
    installNotification("default");
    expect(showDesktopNotification({ title: "An", body: "Chào", tag: "chat:m3" })).toBeNull();
    expect(created).toHaveLength(0);
  });

  it("swallows constructor failures (Android: service-worker only)", () => {
    installNotification("granted", { throws: true });
    expect(() => showDesktopNotification({ title: "An", body: "Chào", tag: "chat:m4" })).not.toThrow();
    expect(showDesktopNotification({ title: "An", body: "Chào", tag: "chat:m5" })).toBeNull();
  });

  it("reports 'unsupported' without the API and asks for permission through it otherwise", async () => {
    expect(readDesktopPermission()).toBe("unsupported");
    expect(await requestDesktopPermission()).toBe("unsupported");
    const { FakeNotification } = installNotification("default");
    const changed = vi.fn();
    window.addEventListener("nesso:desktop-notify-permission", changed);
    expect(await requestDesktopPermission()).toBe("granted");
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener("nesso:desktop-notify-permission", changed);
  });
});
