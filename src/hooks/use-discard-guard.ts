import { useCallback, useRef, useState } from "react";

/**
 * Close requests for a form dialog with unsaved input (P3). Esc, a click outside, the ✕ and "Hủy" all
 * go through `requestClose`: a clean form closes at once, a dirty one asks first ("Bỏ bản nháp?")
 * through an in-page confirmation instead of silently dropping what was typed.
 *
 *   const guard = useDiscardGuard(() => onOpenChange(false));
 *   <Dialog open onOpenChange={(open) => (open ? onOpenChange(true) : guard.requestClose())}>
 *     <Form onDirtyChange={guard.setDirty} onCancel={guard.requestClose} onDone={guard.close} />
 *   </Dialog>
 *   <DiscardDraftDialog {...guard.confirm} />
 */
export const useDiscardGuard = (close: () => void) => {
  const dirtyRef = useRef(false);
  const [confirming, setConfirming] = useState(false);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  /** Closes without asking (after a successful save): the draft is gone on purpose. */
  const closeNow = useCallback(() => {
    dirtyRef.current = false;
    setConfirming(false);
    close();
  }, [close]);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) setConfirming(true);
    else closeNow();
  }, [closeNow]);

  const keepEditing = useCallback(() => setConfirming(false), []);

  return {
    setDirty,
    requestClose,
    close: closeNow,
    confirm: { open: confirming, onKeepEditing: keepEditing, onDiscard: closeNow }
  };
};
