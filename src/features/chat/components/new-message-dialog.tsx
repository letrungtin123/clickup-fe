import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { chatLimits } from "@/contracts/chat";
import type { UserRef } from "@/contracts/work";

import { useOpenDm } from "../hooks/use-channels";
import { PeoplePicker } from "./people-picker";

export const NewMessageDialog = ({
  open,
  onOpenChange,
  initialUsers = []
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUsers?: UserRef[];
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-0 p-0 sm:max-w-md">
      <NewMessageForm initialUsers={initialUsers} onDone={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const NewMessageForm = ({
  initialUsers,
  onDone
}: {
  initialUsers: UserRef[];
  onDone: () => void;
}) => {
  const [selected, setSelected] = useState<UserRef[]>(initialUsers);
  const openDm = useOpenDm();

  const start = () => {
    if (selected.length === 0) return;
    openDm.mutate(
      selected.map((user) => user.id),
      { onSuccess: onDone }
    );
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
      onKeyDownCapture={(event) => {
        // Enter picks people; Ctrl/⌘ + Enter starts the conversation (before the list sees it).
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.stopPropagation();
          start();
        }
      }}
      className="flex flex-col"
    >
      <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
          <MessageSquarePlus className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle>Tin nhắn mới</DialogTitle>
          <DialogDescription>
            Chọn một người để nhắn riêng, hoặc tối đa {chatLimits.dmOthersMax} người cho nhóm. Nhấn
            Ctrl/⌘ + Enter để bắt đầu.
          </DialogDescription>
        </div>
      </DialogHeader>
      <div className="px-5 py-4">
        <PeoplePicker
          autoFocus
          selected={selected}
          onChange={setSelected}
          max={chatLimits.dmOthersMax}
          maxHint={`Nhóm trò chuyện tối đa ${chatLimits.dmOthersMax + 1} người (gồm bạn).`}
        />
      </div>
      <DialogFooter className="mx-0 mb-0">
        <Button type="button" variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" disabled={selected.length === 0 || openDm.isPending}>
          {openDm.isPending ? <Spinner /> : null}
          {selected.length > 1 ? "Tạo nhóm trò chuyện" : "Bắt đầu trò chuyện"}
        </Button>
      </DialogFooter>
    </form>
  );
};
