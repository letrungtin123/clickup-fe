import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey
} from "@tanstack/react-query";
import { useMemo } from "react";

import type {
  CustomField,
  Process,
  ProductionMember,
  ProductionRole,
  ProductionWorkflow,
  Shift
} from "@/contracts/production-catalog";
import { useSessionContext } from "@/features/auth/hooks";
import { isApiError } from "@/lib/api/errors";

import {
  productionApi,
  type ClientInput,
  type CustomFieldInput,
  type NotificationPreferencesInput,
  type ProcessInput,
  type ProjectInput,
  type SetCreditRuleInput,
  type SettingsInput,
  type ShiftInput,
  type StatusInput,
  type TagInput,
  type TeamInput,
  type TransitionsInput,
  type UpdateMemberInput
} from "./api";
import { sortOrderChanges } from "./catalog";
import { productionKeys } from "./keys";
import { visibleNavEntries } from "./nav";
import type { NotificationPreferences } from "./types";
import { hasAnyRole } from "./roles";

/**
 * Data hooks for the production module. Create/update endpoints answer with the whole refreshed
 * collection, so mutations replace the cached list instead of refetching. Every mutation opts out of
 * the global error toast (`errorMessage: false`): callers show production-specific copy inline or via
 * toastProductionError (errors.ts).
 */

// --- Access --------------------------------------------------------------------------------------

/** Never retry "not a member" answers; the module is simply hidden. */
const retryUnlessClientError = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2;

/** GET /production/me — roles, team and public settings. `roles: []` hides the whole module. */
export const useProductionMe = () =>
  useQuery({
    queryKey: productionKeys.me(),
    queryFn: ({ signal }) => productionApi.me(signal),
    staleTime: 60_000,
    retry: retryUnlessClientError
  });

/** UX gate derived from /production/me. The API enforces every rule again. */
export const useProductionAccess = () => {
  const me = useProductionMe();
  const data = me.data;
  return useMemo(() => {
    const roles: readonly ProductionRole[] = data?.roles ?? [];
    return {
      roles,
      isMember: roles.length > 0,
      isAdmin: data?.isAdmin ?? false,
      /** Holds any of `required` (ADMIN always). */
      can: (...required: ProductionRole[]) => roles.length > 0 && hasAnyRole(roles, required)
    };
  }, [data]);
};

/** Sidebar entries for the signed-in user's roles; empty for non-members (module hidden). */
export const useProductionNavEntries = () => {
  const { roles } = useProductionAccess();
  return useMemo(() => visibleNavEntries(roles), [roles]);
};

// --- Reads ---------------------------------------------------------------------------------------

export const useProductionMembers = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.members(),
    queryFn: ({ signal }) => productionApi.members(signal),
    enabled
  });

export const useTeams = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.teams(),
    queryFn: ({ signal }) => productionApi.teams(signal),
    staleTime: 5 * 60_000,
    enabled
  });

export const useClients = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.clients(),
    queryFn: ({ signal }) => productionApi.clients(signal),
    enabled
  });

export const useProductionProjects = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.projects(),
    queryFn: ({ signal }) => productionApi.projects(signal),
    enabled
  });

export const useProcesses = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.processes(),
    queryFn: ({ signal }) => productionApi.processes(signal),
    enabled
  });

export const useShifts = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.shifts(),
    queryFn: ({ signal }) => productionApi.shifts(signal),
    enabled
  });

export const useTags = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.tags(),
    queryFn: ({ signal }) => productionApi.tags(signal),
    staleTime: 5 * 60_000,
    enabled
  });

/** Every entity's fields in one cache entry; filter with `fieldsFor` (custom-fields.ts). */
export const useCustomFields = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.customFields(),
    queryFn: ({ signal }) => productionApi.customFields(signal),
    staleTime: 5 * 60_000,
    enabled
  });

export const useWorkflow = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.workflow(),
    queryFn: ({ signal }) => productionApi.workflow(signal),
    enabled
  });

export const useProductionSettings = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.settings(),
    queryFn: ({ signal }) => productionApi.settings(signal),
    enabled
  });

export const useAllowedEmails = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.allowedEmails(),
    queryFn: ({ signal }) => productionApi.allowedEmails(signal),
    enabled
  });

/** Rules effective on `day`; the previous day's matrix stays on screen while the next one loads. */
export const useCreditMatrix = (day: string, enabled = true) =>
  useQuery({
    queryKey: productionKeys.creditMatrix(day),
    queryFn: ({ signal }) => productionApi.creditMatrix(day, signal),
    placeholderData: (previous) => previous,
    enabled
  });

export const useCreditHistory = (projectId: string, processId: string, enabled = true) =>
  useQuery({
    queryKey: productionKeys.creditHistory(projectId, processId),
    queryFn: ({ signal }) => productionApi.creditHistory(projectId, processId, signal),
    enabled
  });

export const useNotificationPreferences = () =>
  useQuery({
    queryKey: productionKeys.notificationPreferences(),
    queryFn: ({ signal }) => productionApi.notificationPreferences(signal)
  });

// --- Writes --------------------------------------------------------------------------------------

const invalidateAll = (client: QueryClient, keys: readonly QueryKey[]) =>
  Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));

/** Mutation whose response is the refreshed collection stored under `key`. */
const useCollectionMutation = <TVariables, TData>(
  key: QueryKey,
  mutationFn: (variables: TVariables) => Promise<TData>,
  related: readonly QueryKey[] = []
) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    meta: { errorMessage: false },
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void invalidateAll(client, related);
    }
  });
};

export const useTeamMutations = () => ({
  create: useCollectionMutation(productionKeys.teams(), (input: TeamInput) =>
    productionApi.createTeam(input)
  ),
  update: useCollectionMutation(
    productionKeys.teams(),
    ({ id, input }: { id: string; input: TeamInput }) => productionApi.updateTeam(id, input),
    [productionKeys.me()]
  )
});

export const useClientMutations = () => {
  const related = [productionKeys.projects(), productionKeys.creditRules()];
  return {
    create: useCollectionMutation(
      productionKeys.clients(),
      (input: ClientInput) => productionApi.createClient(input),
      related
    ),
    update: useCollectionMutation(
      productionKeys.clients(),
      ({ id, input }: { id: string; input: ClientInput }) => productionApi.updateClient(id, input),
      related
    )
  };
};

export const useProjectMutations = () => {
  const related = [productionKeys.clients(), productionKeys.creditRules()];
  return {
    create: useCollectionMutation(
      productionKeys.projects(),
      (input: ProjectInput) => productionApi.createProject(input),
      related
    ),
    update: useCollectionMutation(
      productionKeys.projects(),
      ({ id, input }: { id: string; input: ProjectInput }) =>
        productionApi.updateProject(id, input),
      related
    )
  };
};

export const useProcessMutations = () => {
  const related = [productionKeys.creditRules()];
  return {
    create: useCollectionMutation(
      productionKeys.processes(),
      (input: ProcessInput) => productionApi.createProcess(input),
      related
    ),
    update: useCollectionMutation(
      productionKeys.processes(),
      ({ id, input }: { id: string; input: ProcessInput }) =>
        productionApi.updateProcess(id, input),
      related
    )
  };
};

export const useShiftMutations = () => ({
  create: useCollectionMutation(productionKeys.shifts(), (input: ShiftInput) =>
    productionApi.createShift(input)
  ),
  update: useCollectionMutation(
    productionKeys.shifts(),
    ({ id, input }: { id: string; input: ShiftInput }) => productionApi.updateShift(id, input)
  )
});

export const useTagMutations = () => ({
  create: useCollectionMutation(productionKeys.tags(), (input: TagInput) =>
    productionApi.createTag(input)
  ),
  update: useCollectionMutation(
    productionKeys.tags(),
    ({ id, input }: { id: string; input: TagInput }) => productionApi.updateTag(id, input)
  )
});

export const useCustomFieldMutations = () => ({
  create: useCollectionMutation(productionKeys.customFields(), (input: CustomFieldInput) =>
    productionApi.createCustomField(input)
  ),
  update: useCollectionMutation(
    productionKeys.customFields(),
    ({ id, input }: { id: string; input: CustomFieldInput }) =>
      productionApi.updateCustomField(id, input)
  )
});

export const useStatusMutations = () => ({
  create: useCollectionMutation(productionKeys.workflow(), (input: StatusInput) =>
    productionApi.createStatus(input)
  ),
  update: useCollectionMutation(
    productionKeys.workflow(),
    ({ id, input }: { id: string; input: StatusInput }) => productionApi.updateStatus(id, input)
  ),
  replaceTransitions: useCollectionMutation(productionKeys.workflow(), (input: TransitionsInput) =>
    productionApi.replaceTransitions(input)
  )
});

/** Drag-and-drop status order: optimistic, rolled back by refetch on failure. */
export const useReorderStatuses = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => productionApi.reorderStatuses(ids),
    meta: { errorMessage: false },
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: productionKeys.workflow() });
      client.setQueryData<ProductionWorkflow>(productionKeys.workflow(), (current) => {
        if (!current) return current;
        const position = new Map(ids.map((id, index) => [id, index]));
        const statuses = [...current.statuses].sort(
          (a, b) => (position.get(a.id) ?? 1e6) - (position.get(b.id) ?? 1e6)
        );
        return { ...current, statuses };
      });
    },
    onSuccess: (data) => client.setQueryData(productionKeys.workflow(), data),
    onError: () => void client.invalidateQueries({ queryKey: productionKeys.workflow() })
  });
};

type Sortable = { id: string; sortOrder: number };

/**
 * Reorders a catalog that only has per-row PATCH (processes, shifts, custom fields): optimistic
 * cache update, then one PATCH per moved row; the last response is the refreshed collection.
 */
const useSequentialReorder = <T extends Sortable>(
  key: QueryKey,
  patch: (item: T, sortOrder: number) => Promise<{ items: T[] }>,
  related: readonly QueryKey[] = []
) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: T[]) => {
      let last: { items: T[] } | null = null;
      for (const { item, sortOrder } of sortOrderChanges(ordered)) {
        last = await patch(item, sortOrder);
      }
      return last;
    },
    meta: { errorMessage: false },
    onMutate: async (ordered) => {
      await client.cancelQueries({ queryKey: key });
      const position = new Map(ordered.map((item, index) => [item.id, (index + 1) * 10]));
      client.setQueryData<{ items: T[] }>(key, (current) =>
        current
          ? {
              items: current.items
                .map((item) => ({ ...item, sortOrder: position.get(item.id) ?? item.sortOrder }))
                .sort((a, b) => a.sortOrder - b.sortOrder)
            }
          : current
      );
    },
    onSuccess: (data) => {
      if (data) client.setQueryData(key, data);
      void invalidateAll(client, related);
    },
    onError: () => void client.invalidateQueries({ queryKey: key })
  });
};

export const useReorderProcesses = () =>
  useSequentialReorder<Process>(
    productionKeys.processes(),
    (item, sortOrder) => productionApi.updateProcess(item.id, { name: item.name, sortOrder }),
    [productionKeys.creditRules()]
  );

export const useReorderShifts = () =>
  useSequentialReorder<Shift>(productionKeys.shifts(), (item, sortOrder) =>
    productionApi.updateShift(item.id, { name: item.name, payMode: item.payMode, sortOrder })
  );

export const useReorderCustomFields = () =>
  useSequentialReorder<CustomField>(productionKeys.customFields(), (field, sortOrder) =>
    productionApi.updateCustomField(field.id, {
      entity: field.entity,
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options,
      required: field.required,
      showInTable: field.showInTable,
      sortOrder
    })
  );

/**
 * Role/team/custom-field/tag changes for one member, applied optimistically to the cached list.
 * Changing your own roles refreshes /production/me (menus follow immediately).
 */
export const useUpdateMember = () => {
  const client = useQueryClient();
  const session = useSessionContext();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateMemberInput }) =>
      productionApi.updateMember(userId, input),
    meta: { errorMessage: false },
    onMutate: async ({ userId, input }) => {
      await client.cancelQueries({ queryKey: productionKeys.members() });
      const previous = client.getQueryData<{ items: ProductionMember[] }>(productionKeys.members());
      client.setQueryData<{ items: ProductionMember[] }>(productionKeys.members(), (current) =>
        current
          ? {
              items: current.items.map((member) =>
                member.userId === userId
                  ? {
                      ...member,
                      ...(input.roles ? { roles: input.roles } : {}),
                      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
                      ...(input.tagIds ? { tagIds: input.tagIds } : {})
                    }
                  : member
              )
            }
          : current
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(productionKeys.members(), context.previous);
    },
    onSuccess: (member) => {
      client.setQueryData<{ items: ProductionMember[] }>(productionKeys.members(), (current) =>
        current
          ? {
              items: current.items.map((item) => (item.userId === member.userId ? member : item))
            }
          : current
      );
      if (member.userId === session.user.id) {
        void client.invalidateQueries({ queryKey: productionKeys.me() });
      }
      void client.invalidateQueries({ queryKey: productionKeys.teams() });
    }
  });
};

/** PUT /credit-rules: the response is the cell's history; every matrix day may have changed. */
export const useSetCreditRule = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SetCreditRuleInput) => productionApi.setCreditRule(input),
    meta: { errorMessage: false },
    onSuccess: (history, input) => {
      client.setQueryData(productionKeys.creditHistory(input.projectId, input.processId), history);
      void client.invalidateQueries({ queryKey: [...productionKeys.creditRules(), "matrix"] });
    }
  });
};

export const useCreateCreditVersion = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (effectiveFrom: string) => productionApi.createCreditVersion(effectiveFrom),
    meta: { errorMessage: false },
    onSuccess: () => void client.invalidateQueries({ queryKey: productionKeys.creditRules() })
  });
};

/** All-or-nothing import; on success new projects/processes may exist too. */
export const useImportCredits = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: productionApi.importCredits,
    meta: { errorMessage: false },
    onSuccess: (result) => {
      if (!result.ok) return;
      void invalidateAll(client, [
        productionKeys.creditRules(),
        productionKeys.projects(),
        productionKeys.processes()
      ]);
    }
  });
};

export const useUpdateSettings = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => productionApi.updateSettings(input),
    meta: { errorMessage: false },
    onSuccess: (settings) => {
      client.setQueryData(productionKeys.settings(), settings);
      void client.invalidateQueries({ queryKey: productionKeys.me() });
    }
  });
};

export const useAllowedEmailMutations = () => {
  const client = useQueryClient();
  return {
    add: useMutation({
      mutationFn: (text: string) => productionApi.addAllowedEmails(text),
      meta: { errorMessage: false },
      onSuccess: () => void client.invalidateQueries({ queryKey: productionKeys.allowedEmails() })
    }),
    remove: useMutation({
      mutationFn: (email: string) => productionApi.removeAllowedEmail(email),
      meta: { errorMessage: false },
      onSuccess: () => void client.invalidateQueries({ queryKey: productionKeys.allowedEmails() })
    })
  };
};

export const useUpdateNotificationPreferences = () => {
  const client = useQueryClient();
  const key = productionKeys.notificationPreferences();
  return useMutation({
    mutationFn: (input: NotificationPreferencesInput) =>
      productionApi.updateNotificationPreferences(input),
    meta: { errorMessage: false },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<NotificationPreferences>(key);
      if (previous) {
        client.setQueryData<NotificationPreferences>(key, {
          ...previous,
          notifyWeb: input.notifyWeb ?? previous.notifyWeb,
          notifyEmail: input.notifyEmail ?? previous.notifyEmail
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: (data) => client.setQueryData(key, data)
  });
};
