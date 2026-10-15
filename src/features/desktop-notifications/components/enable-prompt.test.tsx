// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROMPT_SNOOZE_KEY } from "../storage";
import { EnableDesktopNotificationsPrompt } from "./enable-prompt";

const installNotification = (permission: NotificationPermission) => {
  const requestPermission = vi.fn(() => Promise.resolve<NotificationPermission>("default"));
  vi.stubGlobal(
    "Notification",
    class {
      static permission = permission;
      static requestPermission = requestPermission;
    }
  );
  return requestPermission;
};

const promptText = "Bật thông báo trên máy tính để không bỏ lỡ tin nhắn";

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("enable desktop notifications prompt", () => {
  it("appears after a moment while the browser has not been asked, and 'Để sau' hides it for a week", () => {
    installNotification("default");
    render(<EnableDesktopNotificationsPrompt />);
    expect(screen.queryByText(promptText)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText(promptText)).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Để sau" }));
    });
    expect(Number(window.localStorage.getItem(PROMPT_SNOOZE_KEY))).toBeGreaterThan(Date.now());
  });

  it("'Bật thông báo' asks the browser from the click", () => {
    const requestPermission = installNotification("default");
    render(<EnableDesktopNotificationsPrompt />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Bật thông báo/ }));
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("never shows once the browser answered", () => {
    installNotification("denied");
    render(<EnableDesktopNotificationsPrompt />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(promptText)).toBeNull();
  });
});
