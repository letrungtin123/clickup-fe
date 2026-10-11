import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { KnowledgeChangedEventSchema, type KnowledgeChangedEvent } from "@/contracts/knowledge";
import type { RealtimeRoomType } from "@/contracts/realtime";
import { useSessionContext } from "@/features/auth/hooks";
import { qk } from "@/lib/query-keys";
import { useRealtimeRoom } from "@/lib/realtime/hooks";
import { onUntypedServerEvent, scheduleInvalidate } from "@/lib/realtime/socket";

import { sweepKnowledgeDrafts } from "./local-state";

/**
 * Realtime for one knowledge space (PD-031 §10): joins the `knowledge:<spaceId>` room while a space screen
 * is open and turns `knowledge:changed` hints (ids only, never content) into cache invalidations.
 * The event is validated by hand so it works before and after the realtime contract declares it.
 */

export const knowledgeRoomType = "knowledge" as RealtimeRoomType;
export const knowledgeChangedEvent = "knowledge:changed";

/** Query keys refreshed by one event (pure, unit-tested). */
export const knowledgeEventKeys = (event: KnowledgeChangedEvent): { key: readonly unknown[]; exact?: boolean }[] => {
  const space = event.spaceId;
  const keys: { key: readonly unknown[]; exact?: boolean }[] = [];
  const item = event.itemId;
  switch (event.kind) {
    case "space":
      keys.push({ key: qk.knowledge.space(space), exact: true }, { key: qk.knowledge.spaces(), exact: true });
      break;
    case "members":
      keys.push(
        { key: qk.knowledge.members(space) },
        { key: qk.knowledge.space(space), exact: true },
        { key: qk.knowledge.spaces(), exact: true }
      );
      break;
    case "structure":
      // Statuses / categories changed: labels and counts everywhere in the space.
      keys.push({ key: qk.knowledge.space(space), exact: true }, { key: qk.knowledge.items(space) });
      break;
    case "item_created":
    case "item_deleted":
    case "item_restored":
      keys.push(
        { key: qk.knowledge.items(space) },
        { key: qk.knowledge.trash(space) },
        { key: qk.knowledge.space(space), exact: true },
        { key: qk.knowledge.spaces(), exact: true }
      );
      if (item) keys.push({ key: qk.knowledge.item(item), exact: true });
      break;
    case "item_updated":
      keys.push({ key: qk.knowledge.items(space) });
      if (item) {
        keys.push(
          { key: qk.knowledge.item(item), exact: true },
          { key: qk.knowledge.versions(item) },
          { key: qk.knowledge.history(item) }
        );
      }
      break;
    case "comment":
      if (item) {
        keys.push({ key: qk.knowledge.comments(item) }, { key: qk.knowledge.item(item), exact: true });
      }
      keys.push({ key: qk.knowledge.items(space) });
      break;
    default:
      keys.push({ key: qk.knowledge.space(space) });
  }
  keys.push({ key: qk.knowledge.audit(space) });
  return keys;
};

export const applyKnowledgeEvent = (event: KnowledgeChangedEvent) => {
  for (const entry of knowledgeEventKeys(event)) scheduleInvalidate(entry.key, entry.exact ?? false);
};

/** Latest remote version save per item, for the editor's "Có người vừa lưu" banner. */
type VersionListener = (event: KnowledgeChangedEvent) => void;
const versionListeners = new Set<VersionListener>();
export const onKnowledgeEvent = (listener: VersionListener) => {
  versionListeners.add(listener);
  return () => {
    versionListeners.delete(listener);
  };
};

/**
 * Joins the space room and applies its events. Events caused by the current user are still applied
 * (another tab may be open) but never notify the "someone else saved" listeners.
 */
export const useKnowledgeRoom = (spaceId: string | null) => {
  const session = useSessionContext();
  const status = useRealtimeRoom(spaceId ? { type: knowledgeRoomType, id: spaceId } : null);
  const handle = useEffectEvent((payload: unknown) => {
    const parsed = KnowledgeChangedEventSchema.safeParse(payload);
    if (!parsed.success || parsed.data.spaceId !== spaceId) return;
    applyKnowledgeEvent(parsed.data);
    if (parsed.data.actorId !== session.user.id) {
      for (const listener of [...versionListeners]) listener(parsed.data);
    }
  });
  useEffect(() => {
    if (!spaceId) return undefined;
    return onUntypedServerEvent(knowledgeChangedEvent, (payload) => handle(payload));
  }, [spaceId]);
  return status;
};

/**
 * Shell-wide: `space` / `members` events also reach the organization room (public spaces) and the members'
 * user rooms (private ones), so the sidebar list refreshes without joining every space room.
 */
export const useKnowledgeSidebarSync = (enabled: boolean) => {
  const handle = useEffectEvent((payload: unknown) => {
    const parsed = KnowledgeChangedEventSchema.safeParse(payload);
    if (!parsed.success) return;
    if (parsed.data.kind === "space" || parsed.data.kind === "members") {
      scheduleInvalidate(qk.knowledge.spaces(), true);
      scheduleInvalidate(qk.knowledge.space(parsed.data.spaceId), true);
    }
  });
  useEffect(() => {
    if (!enabled) return undefined;
    return onUntypedServerEvent(knowledgeChangedEvent, (payload) => handle(payload));
  }, [enabled]);
  // Shell-wide upkeep of what knowledge keeps on this device (also loads the sign-out cleanup, KB-SEC FE-02/03).
  useEffect(() => {
    sweepKnowledgeDrafts();
  }, []);
};

/** Sidebar-level hint: the space list changed (created / archived / access granted elsewhere). */
export const invalidateKnowledgeSpaces = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: qk.knowledge.spaces(), exact: true });

export const useKnowledgeAccessRevoked = () => {
  const client = useQueryClient();
  const handle = useEffectEvent((payload: unknown) => {
    const room = (payload as { room?: { type?: string; id?: string } } | null)?.room;
    if (room?.type !== "knowledge" || !room.id) return;
    void invalidateKnowledgeSpaces(client);
    void client.invalidateQueries({ queryKey: qk.knowledge.space(room.id) });
  });
  useEffect(() => onUntypedServerEvent("access:revoked", (payload) => handle(payload)), []);
};
