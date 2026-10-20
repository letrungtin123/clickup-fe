// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import type * as ReactRouter from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeNavigation = { state: string; location?: { key: string } };
const navigation = vi.hoisted(() => {
  const value: FakeNavigation = { state: "idle" };
  return value;
});

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigation: () => navigation
}));

import { RouteProgress } from "./route-progress";

const navigateTo = (key: string | null) => {
  navigation.state = key === null ? "idle" : "loading";
  if (key === null) delete navigation.location;
  else navigation.location = { key };
};
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("RouteProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigateTo(null);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the bar only when a navigation takes longer than a blink, and hides it once the page is there", () => {
    const view = render(<RouteProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    navigateTo("a");
    view.rerender(<RouteProgress />);
    wait(100);
    expect(screen.queryByRole("progressbar")).toBeNull();
    wait(100);
    expect(screen.getByRole("progressbar", { name: "Đang mở trang" })).toBeTruthy();

    navigateTo(null);
    view.rerender(<RouteProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    // The next slow navigation waits its own delay again.
    navigateTo("b");
    view.rerender(<RouteProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    wait(200);
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("a quick navigation never flashes the bar", () => {
    const view = render(<RouteProgress />);
    navigateTo("a");
    view.rerender(<RouteProgress />);
    wait(80);
    navigateTo(null);
    view.rerender(<RouteProgress />);
    wait(500);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
