import {
  claimDelayMs,
  focusedElsewherePath,
  holdsClaim,
  readFocusRecord,
  tryClaim
} from "./election";
import { TAB_ID, isTabInFront } from "./hooks";
import type { ViewerState } from "./rules";
import { showDesktopNotification, type ShowInput } from "./show";
import { safeStorage } from "./storage";

/** Where the person is, seen from this tab (this tab in front, or another focused tab's path). */
export const currentViewer = (): ViewerState => ({
  focusedHere: isTabInFront(),
  pathname: window.location.pathname,
  focusedElsewherePath: focusedElsewherePath(readFocusRecord(safeStorage()), TAB_ID, Date.now())
});

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Tags this tab already handled (duplicate deliveries of one event). */
const handled = new Set<string>();
const rememberTag = (tag: string) => {
  if (handled.has(tag)) return false;
  handled.add(tag);
  if (handled.size > 300) {
    const oldest = handled.values().next().value;
    if (oldest !== undefined) handled.delete(oldest);
  }
  return true;
};

/** Settle time between writing a claim and checking it is still ours. */
const SETTLE_MS = 60;

/**
 * Shows the pop-up from exactly one tab: the last focused tab claims at once, the others after a short delay; a
 * tab that loses the claim drops it. `recheck` runs right before showing (the person may have opened the
 * conversation meanwhile).
 */
export const deliverOnce = async (input: ShowInput, recheck?: () => boolean) => {
  if (!rememberTag(input.tag)) return;
  const storage = safeStorage();
  if (storage) {
    const delay = claimDelayMs(readFocusRecord(storage), TAB_ID);
    if (delay > 0) await wait(delay);
    if (!tryClaim(storage, input.tag, TAB_ID, Date.now())) return;
    await wait(SETTLE_MS);
    if (!holdsClaim(storage, input.tag, TAB_ID)) return;
  }
  if (recheck && !recheck()) return;
  showDesktopNotification(input);
};
