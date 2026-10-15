import { useQueryClient } from "@tanstack/react-query";
import { Globe, Hash, Lock } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ChannelNameSchema, chatLimits, type NamedChannelKind } from "@/contracts/chat";
import type { UserRef } from "@/contracts/work";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";

import { chatErrorMessage } from "../errors";
import { useChannelDepartment } from "../hooks/use-channel-department";
import { useCreateChannel } from "../hooks/use-channels";
import { ChannelDepartmentNote } from "./channel-department";
import { PeoplePicker } from "./people-picker";

const kindOptions = [
  {
    value: "public",
    label: "Công khai",
    icon: Globe,
    description: "Dành cho cả phòng ban: mọi thành viên tự động vào kênh."
  },
  {
    value: "private",
    label: "Riêng tư",
    icon: Lock,
    description: "Chỉ thành viên được mời mới thấy kênh và tin nhắn."
  }
] as const;

export const CreateChannelDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-0 p-0 sm:max-w-lg">
      <CreateChannelForm onDone={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const CreateChannelForm = ({ onDone }: { onDone: () => void }) => {
  const ids = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useCreateChannel();
  const channelDepartment = useChannelDepartment();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<NamedChannelKind>("public");
  const [members, setMembers] = useState<UserRef[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = ChannelNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(
        name.trim().length === 0
          ? "Nhập tên kênh."
          : `Tên kênh tối đa ${chatLimits.channelNameMax} ký tự và không chứa ký tự điều khiển.`
      );
      return;
    }
    setNameError(null);
    // Both kinds belong to the department selected in the header switcher (PD-054).
    const base = {
      kind,
      name: parsed.data,
      description: description.trim() || null,
      ...(channelDepartment.requestDepartment
        ? { department: channelDepartment.requestDepartment }
        : {})
    };
    create.mutate(
      // Public (PD-053): the whole department is added by the server; private: the people picked here.
      kind === "public" ? base : { ...base, memberIds: members.map((user) => user.id) },
      {
        onSuccess: (channel) => {
          toast.success(`Đã tạo kênh #${channel.name ?? parsed.data}`);
          onDone();
          void navigate(`/c/${channel.id}`);
        },
        onError: (error) => {
          if (isApiError(error) && error.code === "CHANNEL_NAME_TAKEN") {
            setNameError(chatErrorMessage(error));
            return;
          }
          // Department membership changed meanwhile: read the departments again.
          if (isApiError(error) && error.code === "DEPARTMENT_FORBIDDEN") {
            void queryClient.invalidateQueries({ queryKey: qk.session() });
          }
          setFormError(chatErrorMessage(error, "Không tạo được kênh. Vui lòng thử lại."));
        }
      }
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-h-[min(88vh,760px)] flex-col">
      <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-12">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
          {kind === "private" ? <Lock className="size-5" /> : <Hash className="size-5" />}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle>Tạo kênh</DialogTitle>
          <DialogDescription>
            Kênh là nơi cả nhóm trao đổi theo chủ đề, dự án hoặc phòng ban.
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
        <Field data-invalid={Boolean(nameError)}>
          <FieldLabel htmlFor={`${ids}-name`}>Tên kênh</FieldLabel>
          <div className="relative">
            <Hash
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-subtle"
              aria-hidden="true"
            />
            <Input
              id={`${ids}-name`}
              autoFocus
              autoComplete="off"
              maxLength={chatLimits.channelNameMax + 2}
              placeholder="ví dụ: thiết-kế-sản-phẩm"
              className="pl-7"
              value={name}
              aria-invalid={Boolean(nameError)}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError(null);
              }}
            />
          </div>
          <FieldError>{nameError}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${ids}-description`}>
            Mô tả <span className="font-normal text-foreground-subtle">(không bắt buộc)</span>
          </FieldLabel>
          <Textarea
            id={`${ids}-description`}
            rows={2}
            maxLength={chatLimits.descriptionMax}
            placeholder="Kênh này dùng để làm gì?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel id={`${ids}-kind`}>Quyền truy cập</FieldLabel>
          <SegmentedControl
            aria-labelledby={`${ids}-kind`}
            value={kind}
            onChange={(next) => {
              setKind(next);
              setFormError(null);
            }}
            options={kindOptions}
            className="w-full"
          />
          <FieldDescription className="text-xs">
            {kindOptions.find((option) => option.value === kind)?.description}
          </FieldDescription>
        </Field>

        <ChannelDepartmentNote
          department={channelDepartment.department}
          kind={kind}
          fromSwitcher={channelDepartment.fromSwitcher}
        />

        {kind === "public" ? null : (
          <Field>
            <FieldLabel>
              Thêm thành viên{" "}
              <span className="font-normal text-foreground-subtle">(không bắt buộc)</span>
            </FieldLabel>
            <PeoplePicker
              selected={members}
              onChange={setMembers}
              max={chatLimits.createMembersMax}
              department={channelDepartment.department}
              listClassName="max-h-44"
            />
            <FieldDescription className="text-xs">
              Chỉ những người bạn thêm (và quản trị kênh mời sau này) mới thấy kênh.
            </FieldDescription>
          </Field>
        )}

        {formError ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {formError}
          </p>
        ) : null}
      </div>

      <DialogFooter className="mx-0 mb-0">
        <Button type="button" variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Spinner /> : null}
          Tạo kênh
        </Button>
      </DialogFooter>
    </form>
  );
};
