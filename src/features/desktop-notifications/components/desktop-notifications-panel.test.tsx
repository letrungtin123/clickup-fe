// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as HooksModule from "../hooks";
import { PREFS_KEY } from "../storage";
import type { DesktopSupport } from "../support";
import { DesktopNotificationsPanel } from "./desktop-notifications-panel";

const support = vi.hoisted((): { value: DesktopSupport } => ({ value: "supported" }));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof HooksModule>()),
  getDesktopSupport: () => support.value
}));

const installNotification = (permission: NotificationPermission) => {
  vi.stubGlobal(
    "Notification",
    class {
      static permission = permission;
      static requestPermission = () => Promise.resolve(permission);
    }
  );
};

beforeEach(() => {
  support.value = "supported";
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Thông báo trên máy tính (settings)", () => {
  it("not asked yet: 'Chưa bật' with the enable button and the device switches", () => {
    installNotification("default");
    render(<DesktopNotificationsPanel />);
    expect(screen.getByText("Chưa bật")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bật thông báo" })).toBeTruthy();
    expect(screen.getAllByRole("switch")).toHaveLength(3);
  });

  it("blocked: explains how to unblock from the address bar", () => {
    installNotification("denied");
    render(<DesktopNotificationsPanel />);
    expect(screen.getByText("Bị chặn")).toBeTruthy();
    expect(screen.getByText("ổ khoá")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bật thông báo" })).toBeNull();
  });

  it("granted: test button, and the switches persist on this device", () => {
    installNotification("granted");
    render(<DesktopNotificationsPanel />);
    expect(screen.getByText("Đã bật")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gửi thử" })).toBeTruthy();
    const [chat, preview] = screen.getAllByRole("switch");
    act(() => {
      if (preview) fireEvent.click(preview);
    });
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")).toMatchObject({ chatPreview: false });
    act(() => {
      if (chat) fireEvent.click(chat);
    });
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")).toMatchObject({ chat: false });
  });

  it("phones get an explanation instead of the controls", () => {
    support.value = "mobile";
    render(<DesktopNotificationsPanel />);
    expect(screen.getByText("Chỉ dùng được trên máy tính")).toBeTruthy();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});
