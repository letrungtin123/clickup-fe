import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { KnowledgeSpaceDetail } from "@/contracts/knowledge";

import { knowledgeErrorMessage } from "../../errors";
import { useArchiveSpace, useDeleteSpace } from "../../hooks";
import { SettingsSection } from "./settings-section";

/** Typed confirmation: same text once spaces and accent encoding (NFC vs NFD input methods) are ignored. */
const sameName = (typed: string, name: string) =>
  typed.normalize("NFC").trim().replace(/\s+/g, " ") ===
  name.normalize("NFC").trim().replace(/\s+/g, " ");

/** "Lưu trữ / Xoá kho": manage + knowledge.delete. Archived spaces offer "Khôi phục kho" instead. */
export const SpaceDangerSection = ({ space }: { space: KnowledgeSpaceDetail }) => {
  const id = useId();
  const archived = space.archivedAt !== null;
  const [dialog, setDialog] = useState<"archive" | "delete" | null>(null);
  const archive = useArchiveSpace();

  const restore = async () => {
    try {
      await archive.mutateAsync({ spaceId: space.id, archived: false });
      toast.success(`Đã khôi phục kho “${space.name}”`);
    } catch (error) {
      toast.error(knowledgeErrorMessage(error, "Không khôi phục được kho. Vui lòng thử lại."));
    }
  };

  return (
    <SettingsSection
      id={`${id}-danger`}
      tone="danger"
      title={archived ? "Khôi phục / Xoá kho" : "Lưu trữ / Xoá kho"}
      description="Những thao tác này ảnh hưởng tới mọi người dùng kho."
    >
      <div className="flex flex-col divide-y">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
            <p className="text-[13px] font-medium">{archived ? "Khôi phục kho" : "Lưu trữ kho"}</p>
            <p className="text-[13px] leading-relaxed text-foreground-muted">
              {archived
                ? "Mở lại kho để thành viên thêm, sửa mục và bình luận như trước."
                : "Kho chuyển sang chỉ xem: chỉ thành viên của kho còn mở được (kho công khai không còn mở cho cả công ty), kho rời khỏi thanh bên và tìm kiếm. Không mất dữ liệu, khôi phục được bất cứ lúc nào."}
            </p>
          </div>
          {archived ? (
            <Button variant="outline" disabled={archive.isPending} onClick={() => void restore()}>
              {archive.isPending ? <Spinner /> : <ArchiveRestore />}
              Khôi phục kho
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setDialog("archive")}>
              <Archive />
              Lưu trữ kho
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
            <p className="text-[13px] font-medium">Xoá kho</p>
            <p className="text-[13px] leading-relaxed text-foreground-muted">
              Kho cùng mọi mục, chuyên mục và tệp đính kèm bị ẩn vĩnh viễn với tất cả mọi người.
              Nhật ký kho vẫn được giữ lại để đối chiếu.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setDialog("delete")}>
            <Trash2 />
            Xoá kho
          </Button>
        </div>
      </div>

      <ArchiveSpaceDialog
        space={space}
        open={dialog === "archive"}
        onClose={() => setDialog(null)}
      />
      <DeleteSpaceDialog space={space} open={dialog === "delete"} onClose={() => setDialog(null)} />
    </SettingsSection>
  );
};

const ArchiveSpaceDialog = ({
  space,
  open,
  onClose
}: {
  space: KnowledgeSpaceDetail;
  open: boolean;
  onClose: () => void;
}) => {
  const archive = useArchiveSpace();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    try {
      await archive.mutateAsync({ spaceId: space.id, archived: true });
      onClose();
      // The space stays open here, read-only (its members still read it); it moves to Tri thức › Đã lưu trữ.
      toast.success(`Đã lưu trữ kho “${space.name}”`, {
        description: "Kho chỉ còn xem được và nằm ở mục Đã lưu trữ của trang Tri thức.",
        action: {
          label: "Hoàn tác",
          // mutateAsync: the promise still settles if this page is gone by then.
          onClick: () =>
            void archive
              .mutateAsync({ spaceId: space.id, archived: false })
              .then(() => toast.success(`Đã khôi phục kho “${space.name}”`))
              .catch((failure: unknown) => toast.error(knowledgeErrorMessage(failure, "Không khôi phục được kho.")))
        }
      });
    } catch (failure) {
      setError(knowledgeErrorMessage(failure, "Không lưu trữ được kho. Vui lòng thử lại."));
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || archive.isPending) return;
        setError(null);
        onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Lưu trữ kho “{space.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Chỉ thành viên của kho còn xem được kho (chỉ xem): không ai thêm, sửa mục hay bình luận,
            và người ngoài kho không mở được nữa, kể cả khi kho công khai. Kho rời khỏi thanh bên; bạn
            khôi phục được bất cứ lúc nào trong Cài đặt kho.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archive.isPending}>Hủy</AlertDialogCancel>
          <Button variant="destructive" disabled={archive.isPending} onClick={() => void confirm()}>
            {archive.isPending ? <Spinner /> : <Archive />}
            Lưu trữ
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const DeleteSpaceDialog = ({
  space,
  open,
  onClose
}: {
  space: KnowledgeSpaceDetail;
  open: boolean;
  onClose: () => void;
}) => {
  const ids = useId();
  const navigate = useNavigate();
  const remove = useDeleteSpace();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = sameName(typed, space.name);

  const close = () => {
    setTyped("");
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!matches || remove.isPending) return;
    setError(null);
    try {
      await remove.mutateAsync(space.id);
      toast.success(`Đã xoá kho “${space.name}”`);
      close();
      void navigate("/k", { replace: true });
    } catch (failure) {
      setError(knowledgeErrorMessage(failure, "Không xoá được kho. Vui lòng thử lại."));
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !remove.isPending) close();
      }}
    >
      <AlertDialogContent>
        {/* `contents`: the form keeps the dialog's grid spacing; Enter in the field confirms. */}
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá kho “{space.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {space.itemCount > 0 ? `${space.itemCount} mục` : "Mọi mục"} cùng chuyên mục và tệp
              đính kèm sẽ bị ẩn vĩnh viễn với tất cả mọi người. Nhật ký kho vẫn được giữ lại. Không
              thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor={`${ids}-confirm`} className="block font-normal">
              Nhập <span className="font-semibold break-words">{space.name}</span> để xác nhận
            </FieldLabel>
            <Input
              id={`${ids}-confirm`}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              placeholder={space.name}
              aria-invalid={error ? true : undefined}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={remove.isPending}>
              Hủy
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!matches || remove.isPending}>
              {remove.isPending ? <Spinner /> : <Trash2 />}
              Xoá vĩnh viễn
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
