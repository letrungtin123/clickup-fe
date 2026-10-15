// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";

import { InlineEditScope, InlineField } from "./inline-field";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A number field and a multi-line note in one scope (one field in edit mode at a time). */
const renderFields = ({
  canEdit = true,
  onSave = vi.fn(() => Promise.resolve()),
  onSaveNote = vi.fn(() => Promise.resolve())
}: {
  canEdit?: boolean;
  onSave?: (draft: string) => Promise<unknown>;
  onSaveNote?: (draft: string) => Promise<unknown>;
} = {}) => {
  render(
    <InlineEditScope>
      <dl>
        <InlineField
          editKey="qty"
          label="Số lượng giao"
          canEdit={canEdit}
          initial={() => "7"}
          renderEditor={({ id, value, onChange, invalid }) => (
            <Input
              id={id}
              value={value}
              aria-invalid={invalid}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
          validate={(value) => (/^\d+$/.test(value) ? null : "Số lượng nguyên ≥ 1.")}
          isUnchanged={(value) => value === "7"}
          onSave={onSave}
          successMessage={(value) => `Đã sửa: 7 → ${value}`}
          hint="Gợi ý thử"
        >
          <span>7</span>
        </InlineField>
        <InlineField
          editKey="note"
          label="Ghi chú"
          canEdit={canEdit}
          multiline
          initial={() => ""}
          renderEditor={({ id, value, onChange }) => (
            <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />
          )}
          onSave={onSaveNote}
          successMessage="Đã lưu ghi chú"
        >
          <span>Chưa có ghi chú</span>
        </InlineField>
      </dl>
    </InlineEditScope>
  );
  return { onSave, onSaveNote };
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
};

const qtyInput = () => screen.getByLabelText<HTMLInputElement>("Số lượng giao");
const qtyField = () => screen.getByRole("button", { name: "Sửa Số lượng giao" });

describe("InlineField — click to edit (PD-047)", () => {
  it("an editable field is its own edit button (pencil next to the label); a read-only one is plain", () => {
    renderFields({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Sửa Số lượng giao" })).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Số lượng giao").closest("dt")?.querySelector("svg")).toBeNull();
    cleanup();
    renderFields();
    const field = qtyField();
    // The button covers the whole field and reads its value; the pencil sits in the label row.
    expect(field.closest("dt")?.textContent).toBe("Số lượng giao");
    expect(field.closest("dt")?.querySelector("svg")).toBeTruthy();
    expect(field.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toBe("7");
    expect(screen.getByRole("button", { name: "Sửa Ghi chú" })).toBeTruthy();
  });

  it("a click opens the editor in place, focused; Esc cancels and focus returns to the field", async () => {
    const { onSave } = renderFields();
    await click(qtyField());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("group", { name: "Sửa Số lượng giao" })).toBeTruthy();
    expect(qtyInput().value).toBe("7");
    expect(document.activeElement).toBe(qtyInput());
    expect(screen.getByText("Gợi ý thử")).toBeTruthy();
    fireEvent.change(qtyInput(), { target: { value: "9" } });
    await act(async () => {
      fireEvent.keyDown(qtyInput(), { key: "Escape" });
      await Promise.resolve();
    });
    expect(screen.queryByLabelText("Số lượng giao")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(qtyField());
  });

  it("Enter saves a one-line field: the draft is sent, a toast confirms, the editor closes", async () => {
    const { onSave } = renderFields();
    await click(qtyField());
    fireEvent.change(qtyInput(), { target: { value: "9" } });
    await act(async () => {
      fireEvent.keyDown(qtyInput(), { key: "Enter" });
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledWith("9");
    expect(toast.success).toHaveBeenCalledWith("Đã sửa: 7 → 9");
    expect(screen.queryByLabelText("Số lượng giao")).toBeNull();
    expect(document.activeElement).toBe(qtyField());
  });

  it("a problem with the draft is shown under the editor and nothing is sent", async () => {
    const { onSave } = renderFields();
    await click(qtyField());
    fireEvent.change(qtyInput(), { target: { value: "abc" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByRole("alert").textContent).toBe("Số lượng nguyên ≥ 1.");
    expect(qtyInput().getAttribute("aria-invalid")).toBe("true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("an unchanged draft just closes; a refused save keeps the editor with the API's message", async () => {
    const onSave = vi.fn(() =>
      Promise.reject(
        new ApiError({
          status: 409,
          code: "QTY_REQUEST_REQUIRED",
          message: "Bạn cần gửi đề nghị để Leader duyệt số tấm giao."
        })
      )
    );
    renderFields({ onSave });
    await click(qtyField());
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Số lượng giao")).toBeNull();

    await click(qtyField());
    fireEvent.change(qtyInput(), { target: { value: "12" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(onSave).toHaveBeenCalledWith("12");
    expect(screen.getByRole("alert").textContent).toBe(
      "Bạn cần gửi đề nghị để Leader duyệt số tấm giao."
    );
    expect(qtyInput().value).toBe("12");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("one field at a time: opening another closes the first", async () => {
    renderFields();
    await click(qtyField());
    expect(qtyInput()).toBeTruthy();
    await click(screen.getByRole("button", { name: "Sửa Ghi chú" }));
    expect(screen.queryByLabelText("Số lượng giao")).toBeNull();
    expect(screen.getByLabelText("Ghi chú")).toBeTruthy();
    expect(qtyField()).toBeTruthy();
  });

  it("Enter in a multi-line editor types a new line; Ctrl+Enter saves", async () => {
    const { onSaveNote } = renderFields();
    await click(screen.getByRole("button", { name: "Sửa Ghi chú" }));
    const note = screen.getByLabelText<HTMLTextAreaElement>("Ghi chú");
    fireEvent.change(note, { target: { value: "Dòng 1" } });
    fireEvent.keyDown(note, { key: "Enter" });
    expect(onSaveNote).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(note, { key: "Enter", ctrlKey: true });
      await Promise.resolve();
    });
    expect(onSaveNote).toHaveBeenCalledWith("Dòng 1");
  });

  it("links and buttons inside a value stay usable: they do not open the editor", async () => {
    const onCopy = vi.fn();
    render(
      <dl>
        <InlineField
          editKey="link"
          label="Link chia việc"
          canEdit
          initial={() => ""}
          renderEditor={({ id }) => <Input id={id} />}
          onSave={() => Promise.resolve()}
          successMessage="ok"
        >
          <span className="select-all">Y:\Client</span>
          <button type="button" onClick={onCopy}>
            Sao chép
          </button>
        </InlineField>
      </dl>
    );
    const copy = screen.getByRole("button", { name: "Sao chép" });
    // Raised above the field's stretched edit button.
    expect(copy.closest("dd")?.className).toContain("[&_button]:z-[1]");
    await click(copy);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "Sửa Link chia việc" })).toBeNull();
  });
});

describe("InlineField — inline variant", () => {
  const renderInline = (trigger?: "field" | "pencil") =>
    render(
      <InlineField
        variant="inline"
        trigger={trigger}
        editKey="process"
        label="Công đoạn"
        canEdit
        initial={() => "Retouch"}
        renderEditor={({ id, value, onChange }) => (
          <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
        )}
        onSave={() => Promise.resolve()}
        successMessage="ok"
        saveLabel="Đổi"
      >
        <h2>#3 · Retouch</h2>
      </InlineField>
    );

  it("the text and the pencil right after it are the edit button; the heading keeps its own name", async () => {
    renderInline();
    expect(screen.getByRole("heading", { name: "#3 · Retouch" })).toBeTruthy();
    const field = screen.getByRole("button", { name: "Sửa Công đoạn" });
    expect(field.parentElement?.querySelector("svg")).toBeTruthy();
    await click(field);
    expect(screen.getByLabelText<HTMLInputElement>("Công đoạn").value).toBe("Retouch");
    // A custom save label.
    expect(within(screen.getByRole("group")).getByRole("button", { name: "Đổi" })).toBeTruthy();
  });

  it("“pencil” trigger: only the pencil edits (the text may be a link of its own)", async () => {
    renderInline("pencil");
    const pencil = screen.getByRole("button", { name: "Sửa Công đoạn" });
    expect(pencil.getAttribute("title")).toBe("Sửa Công đoạn");
    expect(pencil.textContent).toBe("");
    expect(pencil.contains(screen.getByRole("heading"))).toBe(false);
    await click(pencil);
    expect(screen.getByLabelText("Công đoạn")).toBeTruthy();
  });
});
