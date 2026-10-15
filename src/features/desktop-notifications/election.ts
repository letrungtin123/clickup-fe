import { readItem, writeItem } from "./storage";

/**
 * Several open tabs of the app all receive the same realtime event (one socket each). Two small localStorage
 * protocols keep that to one OS pop-up and one sound (PD-055):
 *
 * - **Focus record** — the tab in front writes `{ tab, path, focused, at }` (refreshed while it keeps the focus,
 *   `focused: false` on blur). Other tabs read it to know whether the person is reading the conversation elsewhere,
 *   and the last focused tab gets the first go at showing a pop-up (its click then opens where they were).
 * - **Claims** — `claim:<tag>` = `<tab>|<expiry>`: the first tab to write it (and still hold it a moment later,
 *   which settles simultaneous writers) shows the pop-up; the others drop it. The OS `tag` collapses whatever
 *   slips through anyway.
 *
 * Without storage every tab shows it and the tag collapses them. Pure helpers, injected clock and storage.
 */

export const FOCUS_KEY = "nesso.desktopNotify.focus";
export const CLAIM_PREFIX = "nesso.desktopNotify.claim:";
/** A focused tab refreshes its record this often… */
export const FOCUS_REFRESH_MS = 15_000;
/** …and a record older than this no longer counts (crashed / frozen tab). */
export const FOCUS_MAX_AGE_MS = 45_000;
export const CLAIM_TTL_MS = 30_000;

export type FocusRecord = { tab: string; path: string; focused: boolean; at: number };

export const parseFocusRecord = (raw: string | null): FocusRecord | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FocusRecord> | null;
    if (
      !value ||
      typeof value.tab !== "string" ||
      typeof value.path !== "string" ||
      typeof value.focused !== "boolean" ||
      typeof value.at !== "number"
    ) {
      return null;
    }
    return { tab: value.tab, path: value.path, focused: value.focused, at: value.at };
  } catch {
    return null;
  }
};

export const readFocusRecord = (storage: Storage | null) => parseFocusRecord(readItem(storage, FOCUS_KEY));

export const writeFocusRecord = (storage: Storage | null, record: FocusRecord) =>
  writeItem(storage, FOCUS_KEY, JSON.stringify(record));

/** Marks this tab focused on `path` (now). */
export const markFocused = (storage: Storage | null, tab: string, path: string, now: number) =>
  writeFocusRecord(storage, { tab, path, focused: true, at: now });

/** This tab lost the focus: keep it as "last focused" but no longer in front. Never touches another tab's record. */
export const markBlurred = (storage: Storage | null, tab: string, now: number) => {
  const record = readFocusRecord(storage);
  if (record?.tab === tab && record.focused) writeFocusRecord(storage, { ...record, focused: false, at: now });
};

/** This tab is going away: forget its record (if it is still the latest). */
export const forgetTab = (storage: Storage | null, tab: string) => {
  if (readFocusRecord(storage)?.tab === tab) writeItem(storage, FOCUS_KEY, null);
};

/** Path of ANOTHER tab that is in front right now (fresh record), else null. */
export const focusedElsewherePath = (record: FocusRecord | null, tab: string, now: number) =>
  record && record.tab !== tab && record.focused && now - record.at <= FOCUS_MAX_AGE_MS ? record.path : null;

/** The last focused tab shows pop-ups first; others wait a little before claiming. */
export const claimDelayMs = (record: FocusRecord | null, tab: string, random: number = Math.random()) =>
  record?.tab === tab ? 0 : 150 + Math.round(random * 150);

export const claimKey = (tag: string) => `${CLAIM_PREFIX}${tag}`;

const parseClaim = (raw: string | null) => {
  if (!raw) return null;
  const separator = raw.lastIndexOf("|");
  if (separator <= 0) return null;
  const until = Number(raw.slice(separator + 1));
  return Number.isFinite(until) ? { tab: raw.slice(0, separator), until } : null;
};

/** Takes the claim for `tag` unless another tab holds a live one. */
export const tryClaim = (
  storage: Storage | null,
  tag: string,
  tab: string,
  now: number,
  ttlMs = CLAIM_TTL_MS
): boolean => {
  if (!storage) return true;
  const current = parseClaim(readItem(storage, claimKey(tag)));
  if (current && current.tab !== tab && current.until > now) return false;
  writeItem(storage, claimKey(tag), `${tab}|${now + ttlMs}`);
  return true;
};

/** Still ours after the settle delay? (the last of several simultaneous writers wins) */
export const holdsClaim = (storage: Storage | null, tag: string, tab: string): boolean => {
  if (!storage) return true;
  const current = parseClaim(readItem(storage, claimKey(tag)));
  // Unreadable storage: show rather than lose the message.
  return current === null || current.tab === tab;
};

/** Drops expired claims (they are tiny, but one per message adds up over a day). */
export const pruneClaims = (storage: Storage | null, now: number) => {
  if (!storage) return;
  try {
    const expired: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(CLAIM_PREFIX)) continue;
      const claim = parseClaim(storage.getItem(key));
      if (!claim || claim.until <= now) expired.push(key);
    }
    for (const key of expired) storage.removeItem(key);
  } catch {
    // Storage blocked mid-way: nothing to clean.
  }
};
