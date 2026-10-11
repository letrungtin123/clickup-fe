import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import type {
  CreateKnowledgeItemRequest,
  CreateKnowledgeSpaceRequest,
  KnowledgeAccessLevel,
  KnowledgeComment,
  KnowledgeItemDetail,
  KnowledgeSpace,
  KnowledgeSpaceDetail,
  ReplaceKnowledgeStatusesRequest,
  UpdateKnowledgeItemRequest,
  UpdateKnowledgeSpaceRequest
} from "@/contracts/knowledge";
import type { RichTextDoc } from "@/contracts/rich-text";
import { P } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { placementFor } from "@/lib/ordering";
import { qk } from "@/lib/query-keys";

import { knowledgeApi } from "./api";
import { knowledgeErrorMessage } from "./errors";
import type { OrgKnowledgePermissions } from "./model/access";
import type { ApiQuery } from "./model/filters";

type SpaceCollection = { items: KnowledgeSpace[] };

const nextCursor = (page: { pageInfo: { hasMore: boolean; nextCursor: string | null } }) =>
  page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;

/** The outer permission layer (`knowledge.*`, PD-031). Org admins hold every permission. */
export const useKnowledgePermissions = (): OrgKnowledgePermissions => {
  const { can } = usePermissions();
  return useMemo(
    () => ({ view: can(P.KnowledgeView), create: can(P.KnowledgeCreate), delete: can(P.KnowledgeDelete) }),
    [can]
  );
};

// --- Queries ------------------------------------------------------------------------------------------

export const useKnowledgeSpaces = (enabled = true) =>
  useQuery({
    queryKey: qk.knowledge.spaces(),
    queryFn: ({ signal }) => knowledgeApi.spaces(signal),
    enabled,
    staleTime: 60_000
  });

export const useKnowledgeSpace = (spaceId: string | undefined) =>
  useQuery({
    queryKey: qk.knowledge.space(spaceId ?? ""),
    queryFn: ({ signal }) => knowledgeApi.space(spaceId ?? "", signal),
    enabled: Boolean(spaceId)
  });

export const useKnowledgeMembers = (spaceId: string, enabled = true) =>
  useQuery({
    queryKey: qk.knowledge.members(spaceId),
    queryFn: ({ signal }) => knowledgeApi.members(spaceId, signal),
    enabled
  });

export const useKnowledgeItems = (spaceId: string, query: ApiQuery, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.knowledge.items(spaceId, query),
    queryFn: ({ pageParam, signal }) => knowledgeApi.items(spaceId, query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled
  });

export const useKnowledgeItem = (itemId: string | undefined) =>
  useQuery({
    queryKey: qk.knowledge.item(itemId ?? ""),
    queryFn: ({ signal }) => knowledgeApi.item(itemId ?? "", signal),
    enabled: Boolean(itemId)
  });

export const useKnowledgeVersions = (itemId: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.knowledge.versions(itemId),
    queryFn: ({ pageParam, signal }) => knowledgeApi.versions(itemId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled
  });

/** Versions are immutable: cached forever once loaded. */
export const useKnowledgeVersion = (itemId: string, number: number | null) =>
  useQuery({
    queryKey: qk.knowledge.version(itemId, number ?? 0),
    queryFn: ({ signal }) => knowledgeApi.version(itemId, number ?? 0, signal),
    enabled: number !== null && number > 0,
    staleTime: Number.POSITIVE_INFINITY
  });

export const useKnowledgeHistory = (itemId: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.knowledge.history(itemId),
    queryFn: ({ pageParam, signal }) => knowledgeApi.history(itemId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled
  });

/** Root comments, newest first. */
export const useKnowledgeComments = (itemId: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.knowledge.comments(itemId, "all"),
    queryFn: ({ pageParam, signal }) => knowledgeApi.comments(itemId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled
  });

export const useKnowledgeReplies = (itemId: string, commentId: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.knowledge.replies(itemId, commentId),
    queryFn: ({ signal }) => knowledgeApi.replies(itemId, commentId, signal),
    enabled
  });

export const useKnowledgeTrash = (spaceId: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.knowledge.trash(spaceId),
    queryFn: ({ pageParam, signal }) => knowledgeApi.trash(spaceId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled
  });

export const useKnowledgeAudit = (spaceId: string, query: ApiQuery, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.knowledge.audit(spaceId, query),
    queryFn: ({ pageParam, signal }) => knowledgeApi.audit(spaceId, query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled
  });

// --- Cache helpers ------------------------------------------------------------------------------------

/** After any write to a space: its detail, the sidebar collection and its lists. */
export const refreshSpace = (client: QueryClient, spaceId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: qk.knowledge.space(spaceId), exact: true }),
    client.invalidateQueries({ queryKey: qk.knowledge.spaces(), exact: true })
  ]);

/** After a write to an item: the detail, its version/history lists and the space lists. */
export const refreshItem = (client: QueryClient, itemId: string, spaceId?: string) => {
  const jobs: Promise<unknown>[] = [
    client.invalidateQueries({ queryKey: qk.knowledge.item(itemId), exact: true }),
    client.invalidateQueries({ queryKey: qk.knowledge.versions(itemId) }),
    client.invalidateQueries({ queryKey: qk.knowledge.history(itemId) })
  ];
  if (spaceId) {
    jobs.push(
      client.invalidateQueries({ queryKey: qk.knowledge.items(spaceId) }),
      client.invalidateQueries({ queryKey: qk.knowledge.trash(spaceId) }),
      client.invalidateQueries({ queryKey: qk.knowledge.audit(spaceId) }),
      client.invalidateQueries({ queryKey: qk.knowledge.space(spaceId), exact: true })
    );
  }
  return Promise.all(jobs);
};

const patchItem = (
  client: QueryClient,
  itemId: string,
  patch: (item: KnowledgeItemDetail) => KnowledgeItemDetail
) => client.setQueryData<KnowledgeItemDetail>(qk.knowledge.item(itemId), (item) => (item ? patch(item) : item));

// --- Spaces -------------------------------------------------------------------------------------------

export type CreateSpaceInput = Pick<CreateKnowledgeSpaceRequest, "name" | "visibility" | "color" | "approvalRequired"> & {
  description?: string | null;
  icon?: string | null;
};

export const useCreateSpace = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSpaceInput) => knowledgeApi.createSpace(input),
    meta: { errorMessage: false },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.knowledge.spaces(), exact: true })
  });
};

export const useUpdateSpace = (spaceId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateKnowledgeSpaceRequest) => knowledgeApi.updateSpace(spaceId, input),
    meta: { errorMessage: false },
    onSuccess: () => refreshSpace(client, spaceId)
  });
};

export const useArchiveSpace = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ spaceId, archived }: { spaceId: string; archived: boolean }) =>
      archived ? knowledgeApi.archiveSpace(spaceId) : knowledgeApi.restoreSpace(spaceId),
    meta: { errorMessage: false },
    // An archived space stays readable (read-only) by its members: everything about it is refetched, item
    // capabilities included (no edit, comment or trash while archived).
    onSuccess: (_result, { spaceId }) =>
      Promise.all([
        refreshSpace(client, spaceId),
        client.invalidateQueries({ queryKey: qk.knowledge.items(spaceId) }),
        client.invalidateQueries({ queryKey: [...qk.knowledge.all(), "item"] })
      ])
  });
};

export const useDeleteSpace = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => knowledgeApi.deleteSpace(spaceId),
    meta: { errorMessage: false },
    onSuccess: (_result, spaceId) => {
      client.setQueryData<SpaceCollection>(qk.knowledge.spaces(), (current) =>
        current ? { items: current.items.filter((space) => space.id !== spaceId) } : current
      );
      client.removeQueries({ queryKey: qk.knowledge.space(spaceId) });
      void client.invalidateQueries({ queryKey: qk.knowledge.spaces(), exact: true });
    }
  });
};

/** Optimistic drag / keyboard reorder of spaces in the sidebar. */
export const useReorderSpaces = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, ordered }: { spaceId: string; ordered: KnowledgeSpace[] }) => {
      const placement = placementFor(ordered, spaceId);
      if (!placement) return null;
      return knowledgeApi.updateSpace(spaceId, { placement });
    },
    onMutate: async ({ ordered }) => {
      await client.cancelQueries({ queryKey: qk.knowledge.spaces(), exact: true });
      const previous = client.getQueryData<SpaceCollection>(qk.knowledge.spaces());
      if (previous) {
        const ids = new Set(ordered.map((space) => space.id));
        const rest = previous.items.filter((space) => !ids.has(space.id));
        client.setQueryData<SpaceCollection>(qk.knowledge.spaces(), { items: [...ordered, ...rest] });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(qk.knowledge.spaces(), context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.knowledge.spaces(), exact: true })
  });
};

export const useKnowledgeMemberMutations = (spaceId: string) => {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: qk.knowledge.members(spaceId) }),
      refreshSpace(client, spaceId)
    ]);
  const onError = (error: unknown) => {
    toast.error(knowledgeErrorMessage(error, "Không cập nhật được thành viên."));
  };
  const add = useMutation({
    mutationFn: (input: { userId: string; accessLevel: KnowledgeAccessLevel }) =>
      knowledgeApi.addMember(spaceId, input),
    meta: { errorMessage: false, successMessage: "Đã thêm thành viên vào kho" },
    onError,
    onSuccess: refresh
  });
  const update = useMutation({
    mutationFn: ({ userId, accessLevel }: { userId: string; accessLevel: KnowledgeAccessLevel }) =>
      knowledgeApi.updateMember(spaceId, userId, accessLevel),
    meta: { errorMessage: false, successMessage: "Đã đổi mức quyền" },
    onError,
    onSuccess: refresh
  });
  const remove = useMutation({
    mutationFn: (userId: string) => knowledgeApi.removeMember(spaceId, userId),
    meta: { errorMessage: false, successMessage: "Đã gỡ thành viên khỏi kho" },
    onError,
    onSuccess: refresh
  });
  return { add, update, remove };
};

export const useReplaceStatuses = (spaceId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplaceKnowledgeStatusesRequest) => knowledgeApi.replaceStatuses(spaceId, input),
    meta: { errorMessage: false },
    onSuccess: () =>
      Promise.all([
        refreshSpace(client, spaceId),
        client.invalidateQueries({ queryKey: qk.knowledge.items(spaceId) })
      ])
  });
};

// --- Categories ---------------------------------------------------------------------------------------

export const useCategoryMutations = (spaceId: string) => {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: qk.knowledge.space(spaceId), exact: true }),
      client.invalidateQueries({ queryKey: qk.knowledge.items(spaceId) })
    ]);
  const onError = (error: unknown) => {
    toast.error(knowledgeErrorMessage(error, "Không lưu được chuyên mục."));
  };
  const create = useMutation({
    mutationFn: (input: { name: string; parentId?: string | null }) => knowledgeApi.createCategory(spaceId, input),
    meta: { errorMessage: false },
    onError,
    onSuccess: refresh
  });
  const update = useMutation({
    mutationFn: ({ categoryId, ...input }: { categoryId: string; name?: string; parentId?: string | null }) =>
      knowledgeApi.updateCategory(spaceId, categoryId, input),
    meta: { errorMessage: false },
    onError,
    onSuccess: refresh
  });
  const remove = useMutation({
    mutationFn: (categoryId: string) => knowledgeApi.deleteCategory(spaceId, categoryId),
    meta: { errorMessage: false, successMessage: "Đã xoá chuyên mục" },
    onError,
    onSuccess: refresh
  });
  /** Optimistic reorder among siblings (`ordered` = the siblings in their new order). */
  const reorder = useMutation({
    mutationFn: async ({ categoryId, ordered }: { categoryId: string; ordered: { id: string }[] }) => {
      const placement = placementFor(ordered, categoryId);
      if (!placement) return null;
      return knowledgeApi.updateCategory(spaceId, categoryId, { placement });
    },
    onMutate: async ({ ordered }) => {
      await client.cancelQueries({ queryKey: qk.knowledge.space(spaceId), exact: true });
      const previous = client.getQueryData<KnowledgeSpaceDetail>(qk.knowledge.space(spaceId));
      if (previous) {
        // Give the moved siblings ascending ranks that sort like the new order (server ranks follow).
        const rankOf = new Map(ordered.map((entry, index) => [entry.id, `~${String(index).padStart(4, "0")}`]));
        client.setQueryData<KnowledgeSpaceDetail>(qk.knowledge.space(spaceId), {
          ...previous,
          categories: previous.categories.map((category) =>
            rankOf.has(category.id) ? { ...category, rank: rankOf.get(category.id) ?? category.rank } : category
          )
        });
      }
      return { previous };
    },
    meta: { errorMessage: false },
    onError: (error, _variables, context) => {
      if (context?.previous) client.setQueryData(qk.knowledge.space(spaceId), context.previous);
      onError(error);
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.knowledge.space(spaceId), exact: true })
  });
  return { create, update, remove, reorder };
};

// --- Items --------------------------------------------------------------------------------------------

export type CreateItemInput = Partial<CreateKnowledgeItemRequest> & { title: string; body: RichTextDoc };

export const useCreateItem = (spaceId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateItemInput) => knowledgeApi.createItem(spaceId, input),
    meta: { errorMessage: false },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.knowledge.items(spaceId) }),
        refreshSpace(client, spaceId)
      ])
  });
};

/**
 * Any change to an item. Errors are left to the caller (the editor turns a 409 into the conflict
 * dialog; field changes toast).
 */
export const useUpdateItem = (itemId: string, spaceId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateKnowledgeItemRequest) => knowledgeApi.updateItem(itemId, input),
    meta: { errorMessage: false },
    onSuccess: async () => {
      await refreshItem(client, itemId, spaceId);
    }
  });
};

export const useTogglePin = (item: Pick<KnowledgeItemDetail, "id" | "spaceId" | "pinned">) => {
  const client = useQueryClient();
  return useMutation({
    // Critical items: every change carries a reason (KB-SEC FE-05).
    mutationFn: ({ pinned, reason }: { pinned: boolean; reason?: string | undefined }) =>
      knowledgeApi.updateItem(item.id, { pinned, ...(reason ? { reason } : {}) }),
    meta: { errorMessage: false },
    onMutate: ({ pinned }) => {
      patchItem(client, item.id, (current) => ({ ...current, pinned }));
    },
    onError: (error, { pinned }) => {
      patchItem(client, item.id, (current) => ({ ...current, pinned: !pinned }));
      toast.error(knowledgeErrorMessage(error, "Không ghim được mục."));
    },
    onSettled: () => refreshItem(client, item.id, item.spaceId)
  });
};

export const useFollowItem = (item: Pick<KnowledgeItemDetail, "id">) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean) => (follow ? knowledgeApi.follow(item.id) : knowledgeApi.unfollow(item.id)),
    meta: { errorMessage: "Không cập nhật được theo dõi." },
    onMutate: (follow) => {
      patchItem(client, item.id, (current) => ({
        ...current,
        isFollowing: follow,
        followerCount: Math.max(0, current.followerCount + (follow ? 1 : -1))
      }));
    },
    onError: (_error, follow) => {
      patchItem(client, item.id, (current) => ({
        ...current,
        isFollowing: !follow,
        followerCount: Math.max(0, current.followerCount + (follow ? -1 : 1))
      }));
    },
    onSuccess: (state, follow) => {
      patchItem(client, item.id, (current) => ({ ...current, ...state }));
      toast.success(follow ? "Đã theo dõi mục này" : "Đã bỏ theo dõi");
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.knowledge.item(item.id), exact: true })
  });
};

export const useDeleteItem = (spaceId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason?: string }) => knowledgeApi.deleteItem(itemId, reason),
    meta: { errorMessage: false },
    onSuccess: (_result, { itemId }) => {
      client.removeQueries({ queryKey: qk.knowledge.item(itemId), exact: true });
      return Promise.all([
        client.invalidateQueries({ queryKey: qk.knowledge.items(spaceId) }),
        client.invalidateQueries({ queryKey: qk.knowledge.trash(spaceId) }),
        refreshSpace(client, spaceId)
      ]);
    }
  });
};

export const useRestoreItem = (spaceId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason?: string }) => knowledgeApi.restoreItem(itemId, reason),
    meta: { errorMessage: false },
    onSuccess: (_result, { itemId }) => refreshItem(client, itemId, spaceId)
  });
};

export const usePurgeItem = (spaceId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason?: string }) => knowledgeApi.purgeItem(itemId, reason),
    meta: { errorMessage: false },
    onSuccess: (_result, { itemId }) => {
      client.removeQueries({ queryKey: qk.knowledge.item(itemId) });
      return Promise.all([
        client.invalidateQueries({ queryKey: qk.knowledge.trash(spaceId) }),
        client.invalidateQueries({ queryKey: qk.knowledge.audit(spaceId) })
      ]);
    }
  });
};

export const useRestoreVersion = (item: Pick<KnowledgeItemDetail, "id" | "spaceId">) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ number, reason }: { number: number; reason?: string }) =>
      knowledgeApi.restoreVersion(item.id, number, reason),
    meta: { errorMessage: false },
    onSuccess: () => refreshItem(client, item.id, item.spaceId)
  });
};

// --- Comments -----------------------------------------------------------------------------------------

const refreshComments = (client: QueryClient, itemId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: qk.knowledge.comments(itemId) }),
    client.invalidateQueries({ queryKey: qk.knowledge.item(itemId), exact: true })
  ]);

export const useCreateKnowledgeComment = (itemId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: RichTextDoc; parentCommentId?: string | null; attachmentIds?: string[] }) =>
      knowledgeApi.createComment(itemId, input),
    meta: { errorMessage: false },
    onSuccess: () => refreshComments(client, itemId)
  });
};

export const useUpdateKnowledgeComment = (itemId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: RichTextDoc }) =>
      knowledgeApi.updateComment(itemId, commentId, body),
    meta: { errorMessage: false },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.knowledge.comments(itemId) })
  });
};

export const useDeleteKnowledgeComment = (itemId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (comment: Pick<KnowledgeComment, "id">) => knowledgeApi.deleteComment(itemId, comment.id),
    meta: { errorMessage: false, successMessage: "Đã xoá bình luận" },
    onSuccess: () => refreshComments(client, itemId)
  });
};

export const useResolveKnowledgeComment = (itemId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      knowledgeApi.resolveComment(itemId, commentId, resolved),
    meta: { errorMessage: false },
    onSuccess: (_result, { resolved }) => {
      toast.success(resolved ? "Đã đánh dấu đã xử lý" : "Đã mở lại góp ý");
      return refreshComments(client, itemId);
    }
  });
};
