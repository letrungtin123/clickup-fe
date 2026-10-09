/**
 * Cross-tab session signals (BUG-WK-16). Session cookies are shared by every tab of the origin: when
 * user B signs in (or anyone signs out) in one tab, the others must not keep showing user A's cached
 * data — or worse, act on B's session with A's screens. Tabs announce who they are signed in as and
 * react to each other. BroadcastChannel is used when available; a localStorage `storage` event is the
 * fallback (both may deliver the same signal, so envelopes carry an id).
 */

export type SessionSignal = { type: "signed-in"; userId: string } | { type: "signed-out" };

type Envelope = SessionSignal & { id: string; tab: string; at: number };

/** What a tab signed in as `currentUserId` (null = signed out, e.g. /login) does with a signal. */
export type SessionSignalAction = "none" | "reload" | "sign-out" | "refresh";

export const sessionSignalAction = (currentUserId: string | null, signal: SessionSignal): SessionSignalAction => {
  if (signal.type === "signed-out") return currentUserId ? "sign-out" : "none";
  if (!currentUserId) return "refresh";
  return signal.userId === currentUserId ? "none" : "reload";
};

const channelName = "nesso.session";
export const sessionStorageKey = "nesso.session.signal";
const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const parseEnvelope = (raw: unknown): Envelope | null => {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.tab !== "string" || typeof record.at !== "number") return null;
  if (record.type === "signed-out") return { type: "signed-out", id: record.id, tab: record.tab, at: record.at };
  if (record.type === "signed-in" && typeof record.userId === "string") {
    return { type: "signed-in", userId: record.userId, id: record.id, tab: record.tab, at: record.at };
  }
  return null;
};

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const openChannel = () => {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);
  } catch {
    return null;
  }
};

/** Tells the other tabs of this origin who this tab is signed in as (or that it signed out). */
export const announceSession = (signal: SessionSignal) => {
  const envelope: Envelope = { ...signal, id: newId(), tab: tabId, at: Date.now() };
  const channel = openChannel();
  if (channel) {
    try {
      channel.postMessage(envelope);
    } catch {
      // Closed / unsupported: the storage event below still reaches the other tabs.
    }
    channel.close();
  }
  try {
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(envelope));
  } catch {
    // Storage blocked (private mode): BroadcastChannel alone.
  }
};

/** Signals from other tabs (never this one), de-duplicated across both transports. */
export const subscribeSession = (handler: (signal: SessionSignal) => void) => {
  const seen: string[] = [];
  const deliver = (raw: unknown) => {
    const envelope = parseEnvelope(raw);
    if (!envelope || envelope.tab === tabId || seen.includes(envelope.id)) return;
    seen.push(envelope.id);
    if (seen.length > 50) seen.shift();
    handler(envelope.type === "signed-in" ? { type: "signed-in", userId: envelope.userId } : { type: "signed-out" });
  };
  const channel = openChannel();
  const onMessage = (event: MessageEvent) => deliver(event.data);
  channel?.addEventListener("message", onMessage);
  const onStorage = (event: StorageEvent) => {
    if (event.key === sessionStorageKey && event.newValue) deliver(event.newValue);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel?.removeEventListener("message", onMessage);
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
};
