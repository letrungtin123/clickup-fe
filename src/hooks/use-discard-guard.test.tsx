// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscardDraftDialog } from "@/components/shared/discard-draft-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { useDiscardGuard } from "./use-discard-guard";

const Form = ({
  onDirtyChange,
  onCancel,
  onSaved
}: {
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
}) => {
  const [title, setTitle] = useState("");
  useEffect(() => onDirtyChange(title.trim() !== ""), [title, onDirtyChange]);
  return (
    <div>
      <input aria-label="Tên công việc" value={title} onChange={(event) => setTitle(event.target.value)} />
      <button type="button" onClick={onCancel}>
        Hủy
      </button>
      <button type="button" onClick={onSaved}>
        Lưu
      </button>
    </div>
  );
};

const Harness = ({ onClosed }: { onClosed: () => void }) => {
  const [open, setOpen] = useState(true);
  const guard = useDiscardGuard(() => {
    setOpen(false);
    onClosed();
  });
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : guard.requestClose())}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Tạo công việc</DialogTitle>
          {open ? (
            <Form onDirtyChange={guard.setDirty} onCancel={guard.requestClose} onSaved={guard.close} />
          ) : null}
        </DialogContent>
      </Dialog>
      <DiscardDraftDialog {...guard.confirm} />
    </>
  );
};

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const titleInput = () => screen.queryByLabelText<HTMLInputElement>("Tên công việc");

afterEach(cleanup);

describe("useDiscardGuard (P3)", () => {
  it("closes a clean form at once", async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    await settle();
    fireEvent.click(screen.getByText("Hủy"));
    await settle();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Bỏ bản nháp?")).toBeNull();
  });

  it("asks before dropping typed text, and keeps it when the person goes back", async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    await settle();
    fireEvent.change(titleInput()!, { target: { value: "Gọi lại cho khách" } });
    await settle();

    fireEvent.click(screen.getByText("Hủy"));
    await settle();
    expect(screen.getByText("Bỏ bản nháp?")).toBeTruthy();
    expect(onClosed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Tiếp tục soạn"));
    await settle();
    expect(onClosed).not.toHaveBeenCalled();
    expect(titleInput()?.value).toBe("Gọi lại cho khách");
  });

  it("asks on Escape too, and closes after 'Bỏ bản nháp'", async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    await settle();
    const input = titleInput()!;
    fireEvent.change(input, { target: { value: "Nháp" } });
    await settle();

    fireEvent.keyDown(input, { key: "Escape" });
    await settle();
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByText("Bỏ bản nháp?")).toBeTruthy();

    fireEvent.click(screen.getByText("Bỏ bản nháp"));
    await settle();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("never asks after a successful save", async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    await settle();
    fireEvent.change(titleInput()!, { target: { value: "Xong" } });
    await settle();
    fireEvent.click(screen.getByText("Lưu"));
    await settle();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Bỏ bản nháp?")).toBeNull();
  });
});
