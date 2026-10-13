// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Link, NavLink } from "./router-link";

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;

const app = (start: string) =>
  render(
    <MemoryRouter initialEntries={[start]}>
      <Link to="/jobs/42">Job 42</Link>
      <NavLink to="/jobs" className={({ isActive }) => (isActive ? "on" : "off")}>
        Jobs
      </NavLink>
      <NavLink to="/jobs" end className={({ isActive }) => (isActive ? "on" : "off")}>
        Jobs exact
      </NavLink>
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("router-link", () => {
  it("renders a focusable link without href (no browser URL pill on hover)", () => {
    app("/");
    const link = screen.getByRole("link", { name: "Job 42" });
    expect(link.hasAttribute("href")).toBe(false);
    expect(link.getAttribute("tabindex")).toBe("0");
    expect(link.getAttribute("data-to")).toBe("/jobs/42");
  });

  it("navigates in the app on click and on Enter", () => {
    app("/");
    fireEvent.click(screen.getByRole("link", { name: "Job 42" }));
    expect(screen.getByTestId("where").textContent).toBe("/jobs/42");
    fireEvent.keyDown(screen.getByRole("link", { name: "Jobs" }), { key: "Enter" });
    expect(screen.getByTestId("where").textContent).toBe("/jobs");
  });

  it("opens a new tab on Ctrl/Cmd-click and middle click instead of navigating", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    app("/");
    fireEvent.click(screen.getByRole("link", { name: "Job 42" }), { ctrlKey: true });
    fireEvent(
      screen.getByRole("link", { name: "Job 42" }),
      new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 })
    );
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith("/jobs/42", "_blank", "noopener");
    expect(screen.getByTestId("where").textContent).toBe("/");
  });

  it("marks NavLink active like react-router (prefix unless end)", () => {
    app("/jobs/42");
    expect(screen.getByRole("link", { name: "Jobs" }).className).toContain("on");
    expect(screen.getByRole("link", { name: "Jobs" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Jobs exact" }).className).toContain("off");
  });
});
