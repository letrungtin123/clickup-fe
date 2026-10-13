// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkLinkIcon, WorkLinkValue } from "./work-link";

// PD-040 "Link chia việc": a web link opens in a new tab, a folder path is copied. Fake values only (public repo).
const WEB = "https://drive.example.com/drive/folders/abc123";
const FOLDER = "Y:\\Client\\2026\\Batch 1";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  writeText.mockClear();
  toast.success.mockClear();
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(cleanup);

/** Rows and cards around the link open the task on click: nothing inside may reach them. */
const renderInRow = (node: ReactNode) => {
  const onRow = vi.fn();
  render(
    <div role="button" tabIndex={0} onClick={onRow} onKeyDown={onRow}>
      {node}
    </div>
  );
  return onRow;
};

describe("WorkLinkValue (task sheet, phone card)", () => {
  it("an http(s) value is a plain external link, truncated with the full value as tooltip", () => {
    const onRow = renderInRow(<WorkLinkValue value={WEB} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(WEB);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("title")).toBe(WEB);
    expect(link.querySelector(".truncate")?.textContent).toBe(WEB);
    expect(screen.queryByRole("button", { name: /Sao chép/ })).toBeNull();
    fireEvent.click(link);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("a folder path is text with Sao chép (no link); copying keeps the row closed", async () => {
    const onRow = renderInRow(<WorkLinkValue value={FOLDER} />);
    expect(screen.queryByRole("link")).toBeNull();
    const text = screen.getByText(FOLDER);
    expect(text.getAttribute("title")).toBe(FOLDER);
    expect(text.className).toContain("truncate");
    const copy = screen.getByRole("button", { name: `Sao chép link chia việc: ${FOLDER}` });
    expect(copy.textContent).toBe("Sao chép");
    await act(async () => {
      fireEvent.click(copy);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(FOLDER);
    expect(toast.success).toHaveBeenCalledWith("Đã sao chép link chia việc");
    expect(copy.textContent).toBe("Đã chép");
    expect(onRow).not.toHaveBeenCalled();
  });

  it("no value shows a dash; a value that only mentions http later is still a path", () => {
    render(<WorkLinkValue value={null} />);
    expect(screen.getByText("—")).toBeTruthy();
    cleanup();
    render(<WorkLinkValue value="Xem https://x.example" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: /Sao chép/ })).toBeTruthy();
  });

  it("javascript: and other schemes are never links", () => {
    render(<WorkLinkValue value="javascript:alert(1)" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("WorkLinkIcon (job task table)", () => {
  it("an http(s) value is an icon link to the URL", () => {
    const onRow = renderInRow(<WorkLinkIcon value={WEB} />);
    const link = screen.getByRole("link", { name: `Mở link chia việc: ${WEB}` });
    expect(link.getAttribute("href")).toBe(WEB);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("title")).toBe(WEB);
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });
    expect(onRow).not.toHaveBeenCalled();
  });

  it("a folder path is an icon button that copies it, the path as tooltip", async () => {
    const onRow = renderInRow(<WorkLinkIcon value={FOLDER} />);
    expect(screen.queryByRole("link")).toBeNull();
    const button = screen.getByRole("button", { name: `Sao chép link chia việc: ${FOLDER}` });
    expect(button.getAttribute("title")).toContain(FOLDER);
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(FOLDER);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("renders nothing without a value", () => {
    const { container } = render(<WorkLinkIcon value={null} />);
    expect(container.innerHTML).toBe("");
  });
});
