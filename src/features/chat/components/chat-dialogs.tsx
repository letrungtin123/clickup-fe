import { useChatDialogStore } from "../model/ui-state";
import { BrowseChannelsDialog } from "./browse-channels-dialog";
import { CreateChannelDialog } from "./create-channel-dialog";
import { NewMessageDialog } from "./new-message-dialog";

/** Hosts the app-wide chat dialogs (opened through useChatDialogStore). */
export const ChatDialogs = () => {
  const dialog = useChatDialogStore((state) => state.dialog);
  const close = useChatDialogStore((state) => state.close);
  const onOpenChange = (open: boolean) => {
    if (!open) close();
  };
  return (
    <>
      <CreateChannelDialog open={dialog === "create-channel"} onOpenChange={onOpenChange} />
      <BrowseChannelsDialog open={dialog === "browse-channels"} onOpenChange={onOpenChange} />
      <NewMessageDialog open={dialog === "new-message"} onOpenChange={onOpenChange} />
    </>
  );
};
