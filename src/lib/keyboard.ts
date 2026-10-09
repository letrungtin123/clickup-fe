const isApplePlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** "mod" renders ⌘ on Apple platforms and Ctrl elsewhere. */
export const modKeyLabel = () => (isApplePlatform() ? "⌘" : "Ctrl");

/** True when the event matches mod+key (⌘ on Apple, Ctrl elsewhere). */
export const isModKey = (event: KeyboardEvent | React.KeyboardEvent, key: string) =>
  (isApplePlatform() ? event.metaKey : event.ctrlKey) &&
  !event.altKey &&
  event.key.toLowerCase() === key.toLowerCase();
