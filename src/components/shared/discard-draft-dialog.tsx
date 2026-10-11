import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

/**
 * "Bỏ bản nháp?" — asked when a dirty form dialog is closed (see useDiscardGuard). Esc / outside
 * click here mean "keep editing"; focus starts on the safe choice.
 */
export const DiscardDraftDialog = ({
  open,
  onKeepEditing,
  onDiscard,
  title = "Bỏ bản nháp?",
  description = "Nội dung bạn vừa nhập sẽ không được lưu."
}: {
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  title?: string;
  description?: string;
}) => (
  <AlertDialog open={open} onOpenChange={(next) => !next && onKeepEditing()}>
    {/* Esc closes only this question, not the form dialog underneath. */}
    <AlertDialogContent onKeyDown={(event) => event.key === "Escape" && event.stopPropagation()}>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel autoFocus>Tiếp tục soạn</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onDiscard}>
          Bỏ bản nháp
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
