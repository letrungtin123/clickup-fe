import { cn } from "cn";
import { CalendarPlus, Info } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

import { productionErrorMessage } from "../../errors";
import { formatDay } from "../../format";
import { useCreateCreditVersion } from "../../hooks";
import { DateField } from "../date-field";
import { FormAlert, InfoNote } from "../settings-kit";
import { sheetOnPhone } from "../../ui";

/**
 * "Tạo phiên bản mới từ ngày…" (SPEC Phase 1): copies every rule effective on that day into a new
 * version starting that day, so prices can then be edited for the new period only.
 */
export const CreditVersionDialog = ({
  open,
  onOpenChange,
  today,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  onCreated: (effectiveFrom: string) => void;
}) => {
  const ids = useId();
  const create = useCreateCreditVersion();
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setError(null);
      setEffectiveFrom(today);
    }
    onOpenChange(next);
  };

  const submit = () =>
    create.mutate(effectiveFrom, {
      onSuccess: ({ created }) => {
        if (created === 0) {
          toast.info(
            `Không có đơn giá nào cần sao chép: mọi ô đã có phiên bản bắt đầu ${formatDay(effectiveFrom)} hoặc chưa có giá.`
          );
        } else {
          toast.success(
            `Đã tạo phiên bản mới từ ${formatDay(effectiveFrom)} cho ${created} ô đơn giá`
          );
        }
        onCreated(effectiveFrom);
        close(false);
      },
      onError: (failure) => setError(productionErrorMessage(failure))
    });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <DialogHeader>
          <DialogTitle>Tạo phiên bản mới từ ngày…</DialogTitle>
          <DialogDescription>
            Sao chép toàn bộ đơn giá đang áp dụng vào ngày được chọn thành phiên bản mới bắt đầu từ
            ngày đó. Sau đó sửa từng ô cho kỳ giá mới; kỳ cũ giữ nguyên.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel id={`${ids}-from`}>Ngày bắt đầu phiên bản mới</FieldLabel>
          <DateField
            aria-labelledby={`${ids}-from`}
            value={effectiveFrom}
            onChange={(day) => {
              if (day) setEffectiveFrom(day);
              setError(null);
            }}
            today={today}
          />
        </Field>
        <InfoNote icon={Info}>
          Điểm và tiền đã ghi cho task không bao giờ tính lại; task Done từ ngày này trở đi dùng giá
          mới.
        </InfoNote>
        <FormAlert>{error}</FormAlert>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Spinner /> : <CalendarPlus />}
            Tạo phiên bản
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
