/**
 * Per-device preferences for desktop (OS) notifications (PD-055). Stored in localStorage on purpose: the browser
 * permission is per device / browser profile too, so "Tin nhắn", "Hiện nội dung" and "Công việc" follow it rather
 * than the account. Every access is wrapped — private windows and blocked site data must never break the shell.
 */

export type DesktopPrefs = {
  /** Chat messages pop up (DMs, channels at "Mọi tin nhắn", @mentions). */
  chat: boolean;
  /** Show the message text; off → "Bạn có tin nhắn mới". */
  chatPreview: boolean;
  /** Inbox notifications other than chat: assignments, QC, leave, knowledge… */
  work: boolean;
};

export const defaultDesktopPrefs: DesktopPrefs = { chat: true, chatPreview: true, work: true };

export const PREFS_KEY = "nesso.desktopNotify.prefs.v1";
export const PROMPT_SNOOZE_KEY = "nesso.desktopNotify.promptSnoozedUntil";
/** "Để sau" hides the shell prompt for a week. */
export const PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** Same-tab change signal (the `storage` event only reaches other tabs). */
export const PREFS_CHANGED_EVENT = "nesso:desktop-notify-prefs";

/** localStorage, or null when the browser refuses it (the getter itself may throw). */
export const safeStorage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const readItem = (storage: Storage | null, key: string): string | null => {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const writeItem = (storage: Storage | null, key: string, value: string | null) => {
  if (!storage) return;
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Quota / blocked storage: the preference simply does not persist.
  }
};

/** Parses the stored JSON leniently: unknown or broken values fall back to the defaults, field by field. */
export const parsePrefs = (raw: string | null): DesktopPrefs => {
  if (!raw) return defaultDesktopPrefs;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return defaultDesktopPrefs;
    const record = value as Record<string, unknown>;
    const pick = (key: keyof DesktopPrefs) =>
      typeof record[key] === "boolean" ? record[key] : defaultDesktopPrefs[key];
    return { chat: pick("chat"), chatPreview: pick("chatPreview"), work: pick("work") };
  } catch {
    return defaultDesktopPrefs;
  }
};

export const readPrefs = (storage: Storage | null = safeStorage()): DesktopPrefs =>
  parsePrefs(readItem(storage, PREFS_KEY));

export const writePrefs = (patch: Partial<DesktopPrefs>, storage: Storage | null = safeStorage()) => {
  const next = { ...readPrefs(storage), ...patch };
  writeItem(storage, PREFS_KEY, JSON.stringify(next));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PREFS_CHANGED_EVENT));
  return next;
};

export const isPromptSnoozed = (now: number, storage: Storage | null = safeStorage()) => {
  const until = Number(readItem(storage, PROMPT_SNOOZE_KEY));
  return Number.isFinite(until) && until > now;
};

export const snoozePrompt = (now: number, storage: Storage | null = safeStorage()) => {
  writeItem(storage, PROMPT_SNOOZE_KEY, String(now + PROMPT_SNOOZE_MS));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PREFS_CHANGED_EVENT));
};
