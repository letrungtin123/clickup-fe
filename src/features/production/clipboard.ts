/**
 * Copies text. The async clipboard needs a secure context, and the app is also served over plain
 * http: fall back to a hidden textarea + execCommand("copy"). The textarea goes inside `container`
 * (e.g. the open dialog or sheet) so its focus trap does not pull focus away before the copy.
 * Resolves to whether the text reached the clipboard.
 */
export const copyText = async (text: string, container: HTMLElement | null = null) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refused or not focused: try the legacy path.
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.tabIndex = -1;
  Object.assign(area.style, { position: "fixed", top: "0", left: "0", opacity: "0" });
  (container ?? document.body).append(area);
  area.focus({ preventScroll: true });
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  previous?.focus({ preventScroll: true });
  return copied;
};

/** The open dialog / sheet around `element` (where the fallback textarea must go), if any. */
export const dialogAround = (element: Element | null) =>
  element?.closest<HTMLElement>("[role=dialog]") ?? null;
