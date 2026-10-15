import { useEffect, useMemo, useRef } from "react";

import type { ChatChannel } from "@/contracts/chat";
import type { Department } from "@/contracts/departments";
import { useDepartment, useMyDepartments } from "@/features/departments/hooks";

import {
  channelsInDepartment,
  departmentToShow,
  otherDepartmentUnread,
  type DepartmentScope
} from "../model/departments";
import { useChannels } from "./use-channels";

/**
 * Chat follows the header department switcher (PD-054). The scope is the department selected in the switcher; people
 * without a switcher (one department, or none) see every conversation.
 */
export const useChatDepartmentScope = (): DepartmentScope => {
  const { current, departments, canSwitch } = useMyDepartments();
  const scoped = canSwitch ? current : null;
  return useMemo(() => ({ current: scoped, departments }), [departments, scoped]);
};

/**
 * The conversations of the selected department (sidebar sections, "/c", chat badges), from the channel list the chat
 * runtime keeps live — no extra request. Rooms are still joined for every conversation (ChatRuntime), so badges and
 * notifications of the other departments stay live.
 */
export const useDepartmentChannels = () => {
  const query = useChannels();
  const scope = useChatDepartmentScope();
  const items = useMemo(
    () => (query.data ? channelsInDepartment(query.data.items, scope) : []),
    [query.data, scope]
  );
  return { query, items };
};

/** Unread waiting in the other departments (switcher badges): total and per department, same rule as the chat badge. */
export const useOtherDepartmentUnread = () => {
  const channels = useChannels();
  const scope = useChatDepartmentScope();
  return useMemo(() => otherDepartmentUnread(channels.data?.items ?? [], scope), [channels.data, scope]);
};

type EnsureTarget = Pick<ChatChannel, "id" | "kind" | "department"> & {
  audienceDepartments?: readonly Department[] | undefined;
};

/**
 * A conversation opened while the selected department does not show it (a link, a notification, search) switches the
 * department to one of the viewer's departments that shows it (PD-054), so the sidebar highlights it. Checked once per
 * conversation opened: switching back by hand afterwards is respected. Used by the conversation screen
 * (`useEnsureConversationDepartment(channel)`); anything that opens a conversation just navigates to `/c/<id>`.
 */
export const useEnsureConversationDepartment = (channel: EnsureTarget | null | undefined) => {
  const { current, departments, canSwitch, setDepartment } = useDepartment();
  const handled = useRef<string | null>(null);
  const channelId = channel?.id ?? null;
  const target =
    channel && canSwitch ? departmentToShow(channel, { current, departments }) : null;

  useEffect(() => {
    if (channelId === null || handled.current === channelId) return;
    handled.current = channelId;
    if (target) setDepartment(target);
  }, [channelId, setDepartment, target]);
};
