import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import type {
  ChannelAccess,
  ChannelRole,
  ChatChannelCollection,
  ChatChannelDetail,
  NotifyLevel
} from "@/contracts/chat";
import type { Department } from "@/contracts/departments";
import type { DirectoryPurpose } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";

import { chatApi, type CreateChannelInput, type UpdateChannelInput } from "../api";
import { chatErrorMessage, isChannelGone } from "../errors";
import { chatKeys } from "../keys";
import {
  removeSidebarChannel,
  updateSidebarChannel,
  upsertSidebarChannel
} from "../model/channels";

export const channelsQueryOptions = {
  queryKey: chatKeys.channels(),
  queryFn: ({ signal }: { signal: AbortSignal }) => chatApi.channels(signal),
  staleTime: 60_000
};

/** Sidebar: my channels + DMs with unread / mention counts (kept live by the chat runtime). */
export const useChannels = () => useQuery(channelsQueryOptions);

export const useChannel = (channelId: string | undefined) =>
  useQuery({
    queryKey: chatKeys.channel(channelId ?? "none"),
    queryFn: ({ signal }) => chatApi.channel(channelId ?? "", signal),
    enabled: Boolean(channelId),
    staleTime: 30_000,
    retry: (failureCount, error) => !isChannelGone(error) && failureCount < 2
  });

/** Writes a fresh channel detail into the detail cache and the sidebar. */
export const storeChannelDetail = (queryClient: QueryClient, detail: ChatChannelDetail) => {
  queryClient.setQueryData(chatKeys.channel(detail.id), detail);
  if (detail.isMember) {
    queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (current) =>
      upsertSidebarChannel(current, detail)
    );
  } else {
    queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (current) =>
      removeSidebarChannel(current, detail.id)
    );
  }
};

/** Drops every cached trace of a channel the viewer can no longer see. */
export const forgetChannel = (queryClient: QueryClient, channelId: string) => {
  queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (current) =>
    removeSidebarChannel(current, channelId)
  );
  queryClient.removeQueries({ queryKey: chatKeys.messages(channelId) });
  queryClient.removeQueries({ queryKey: chatKeys.membersAll(channelId) });
};

/** Public channels to join, of `department` (the one in the header switcher, PD-054). */
export const useBrowseChannels = (q: string, department: Department | null, enabled = true) =>
  useInfiniteQuery({
    queryKey: chatKeys.browse(q, department),
    queryFn: ({ signal, pageParam }) =>
      chatApi.browse({ q, department, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : null),
    enabled,
    staleTime: 15_000
  });

export const useCreateChannel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChannelInput) => chatApi.create(input),
    meta: { errorMessage: false },
    onSuccess: (detail) => storeChannelDetail(queryClient, detail)
  });
};

export const useUpdateChannel = (channelId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateChannelInput) => chatApi.update(channelId, input),
    meta: { errorMessage: false },
    onSuccess: (detail) => storeChannelDetail(queryClient, detail)
  });
};

export const useArchiveChannel = (channelId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) =>
      archived ? chatApi.archive(channelId) : chatApi.unarchive(channelId),
    meta: { errorMessage: false },
    onSuccess: (detail, archived) => {
      storeChannelDetail(queryClient, detail);
      toast.success(archived ? "Đã lưu trữ kênh" : "Đã khôi phục kênh");
    },
    onError: (error) => toast.error(chatErrorMessage(error))
  });
};

export const useDeleteChannel = (channelId: string) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => chatApi.remove(channelId),
    meta: { errorMessage: false },
    onSuccess: () => {
      void navigate("/c", { replace: true });
      forgetChannel(queryClient, channelId);
      queryClient.removeQueries({ queryKey: chatKeys.channel(channelId) });
      toast.success("Đã xóa kênh");
    },
    onError: (error) => toast.error(chatErrorMessage(error))
  });
};

export const useJoinChannel = (channelId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => chatApi.join(channelId),
    meta: { errorMessage: false },
    onSuccess: (detail) => {
      storeChannelDetail(queryClient, detail);
      // Read marker / capabilities changed: refresh the window so the composer and divider update.
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(channelId) });
    },
    onError: (error) => toast.error(chatErrorMessage(error))
  });
};

export const useLeaveChannel = (channelId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => chatApi.leave(channelId),
    meta: { errorMessage: false },
    onSuccess: () => {
      forgetChannel(queryClient, channelId);
      void queryClient.invalidateQueries({ queryKey: chatKeys.channel(channelId), exact: true });
      toast.success("Bạn đã rời kênh");
    }
  });
};

export const useNotifyLevel = (channelId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (level: NotifyLevel) => chatApi.setNotifyLevel(channelId, level),
    meta: { errorMessage: false },
    onMutate: (level) => {
      const previous = queryClient.getQueryData<ChatChannelCollection>(chatKeys.channels());
      queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (current) =>
        updateSidebarChannel(current, channelId, (channel) => ({ ...channel, notifyLevel: level }))
      );
      queryClient.setQueryData<ChatChannelDetail>(chatKeys.channel(channelId), (current) =>
        current ? { ...current, notifyLevel: level } : current
      );
      return { previous };
    },
    onError: (error, _level, context) => {
      if (context?.previous) queryClient.setQueryData(chatKeys.channels(), context.previous);
      void queryClient.invalidateQueries({ queryKey: chatKeys.channel(channelId), exact: true });
      toast.error(chatErrorMessage(error));
    },
    onSuccess: (_membership, level) =>
      toast.success(
        level === "all"
          ? "Bạn sẽ nhận thông báo cho mọi tin nhắn"
          : level === "mentions"
            ? "Chỉ thông báo khi có người nhắc tên bạn"
            : "Đã tắt thông báo kênh này"
      )
  });
};

/** Opens (get-or-create) a 1:1 or group DM and navigates to it. */
export const useOpenDm = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useSessionContext();
  return useMutation({
    mutationFn: (userIds: string[]) =>
      chatApi.openDm(userIds.filter((id) => id !== session.user.id)),
    meta: { errorMessage: false },
    onSuccess: (detail) => {
      storeChannelDetail(queryClient, detail);
      void navigate(`/c/${detail.id}`);
    },
    onError: (error) => toast.error(chatErrorMessage(error))
  });
};

// Members ------------------------------------------------------------------------------------------

export const useChannelMembers = (channelId: string, q: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: chatKeys.members(channelId, q),
    queryFn: ({ signal, pageParam }) =>
      chatApi.members(
        channelId,
        { q, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) },
        signal
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : null),
    enabled,
    staleTime: 30_000
  });

export const useMemberMutations = (channelId: string) => {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: chatKeys.membersAll(channelId) });
    void queryClient.invalidateQueries({ queryKey: chatKeys.channel(channelId), exact: true });
  };
  const add = useMutation({
    mutationFn: (input: { userIds: string[]; access: ChannelAccess }) =>
      chatApi.addMembers(channelId, input.userIds, input.access),
    meta: { errorMessage: false },
    onSuccess: (result) => {
      refresh();
      toast.success(
        result.items.length === 0
          ? "Những người này đã ở trong kênh"
          : `Đã thêm ${result.items.length} thành viên`
      );
    },
    onError: (error) => toast.error(chatErrorMessage(error))
  });
  const update = useMutation({
    mutationFn: (input: { userId: string; access?: ChannelAccess; role?: ChannelRole }) =>
      chatApi.updateMember(channelId, input.userId, {
        ...(input.access ? { access: input.access } : {}),
        ...(input.role ? { role: input.role } : {})
      }),
    meta: { errorMessage: false },
    onSuccess: refresh,
    onError: (error) => toast.error(chatErrorMessage(error))
  });
  const remove = useMutation({
    mutationFn: (userId: string) => chatApi.removeMember(channelId, userId),
    meta: { errorMessage: false },
    onSuccess: () => {
      refresh();
      toast.success("Đã xóa khỏi kênh");
    },
    onError: (error) => toast.error(chatErrorMessage(error))
  });
  return { add, update, remove };
};

/**
 * People search for pickers (create channel, add members), channel-scoped mention search, or the
 * people the viewer may message (`purpose: "dm"`, open to every member). `department` (PD-054) keeps
 * the results to one department (the one in the header switcher).
 */
export const usePeopleSearch = (
  q: string,
  options: {
    channelId?: string;
    purpose?: DirectoryPurpose;
    department?: Department | null;
    enabled?: boolean;
  } = {}
) => {
  const scope = options.purpose ?? options.channelId;
  return useQuery({
    queryKey: chatKeys.people(
      q,
      options.department ? `${scope ?? "org"}:${options.department}` : scope
    ),
    queryFn: ({ signal }) =>
      chatApi.directory(
        {
          q,
          limit: 20,
          ...(options.purpose
            ? { purpose: options.purpose }
            : options.channelId
              ? { channelId: options.channelId }
              : {}),
          ...(options.department ? { department: options.department } : {})
        },
        signal
      ),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    placeholderData: (previous) => previous
  });
};
