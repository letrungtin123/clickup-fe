import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey
} from "@tanstack/react-query";
import { useMemo } from "react";

import type {
  CustomField,
  FeaturePermissionKey,
  JobScopes,
  Process,
  ProductionMember,
  ProductionRole,
  ProductionWorkflow,
  Shift
} from "@/contracts/production-catalog";
import { useSessionContext } from "@/features/auth/hooks";
import type { QueryValue } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";

import {
  productionApi,
  type ClientInput,
  type CreateUserInput,
  type CustomFieldInput,
  type JobStatusCreateInput,
  type JobStatusUpdateInput,
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
import { productionKeys } from "./keys";
import { kpiKeys, scoreKeys } from "./scores/keys";
import { fallbackFeatures } from "./feature-permissions";
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

const noJobScopes: JobScopes = { view: "none", create: "none", update: "none", delete: "none" };

/** UX gate derived from /production/me. The API enforces every rule again. */
export const useProductionAccess = () => {
  const me = useProductionMe();
  const data = me.data;
  return useMemo(() => {
    const roles: readonly ProductionRole[] = data?.roles ?? [];
    // PD-065: the caller's features from /production/me (the default matrix only until they are known).
    const features: ReadonlySet<FeaturePermissionKey> = new Set(
      data?.features ?? fallbackFeatures(roles)
    );
    return {
      roles,
      isMember: roles.length > 0,
      isAdmin: data?.isAdmin ?? false,
      /**
       * My scopes in the job permission matrix (PD-036): view (job menu / list), create ("Tạo job" needs all;
       * "Nhập công việc" own or all — all also picks the assignee), update / delete. All "none" until loaded.
       */
      jobScopes: data?.jobPermissions ?? noJobScopes,
      /** Holds any of `required` (ADMIN always). */
      can: (...required: ProductionRole[]) => roles.length > 0 && hasAnyRole(roles, required),
      /** My features (PD-065): Hàng chờ QC, Bảng điều khiển, Quản trị số liệu, Bất thường, Khách hàng, scores, leave. */
      features,
      hasFeature: (feature: FeaturePermissionKey) => features.has(feature),
      /**
       * Sees every job in the Leader dashboard and "Bất thường" (Quản trị / Director; the superadmin holds both roles);
       * anyone else sees the jobs they lead.
       */
      seesEveryJob: roles.includes("ADMIN") || roles.includes("DIRECTOR")
    };
  }, [data]);
};

/**
 * Sidebar entries for the signed-in user's roles and features (PD-065); empty for non-members (module hidden).
 */
export const useProductionNavEntries = () => {
  const me = useProductionMe();
  const { roles } = useProductionAccess();
  const jobView = me.data?.jobPermissions.view;
  const features = me.data?.features;
  return useMemo(() => visibleNavEntries(roles, { jobView, features }), [roles, jobView, features]);
};

// --- Reads ---------------------------------------------------------------------------------------

const noFilters: Record<string, QueryValue> = {};

/**
 * Production members. `filters` (USER tags / custom fields, list-filters.ts) is Admin-only: the API
 * answers 403 CUSTOM_FIELDS_FORBIDDEN to anyone else.
 */
export const useProductionMembers = (
  enabled = true,
  filters: Record<string, QueryValue> = noFilters
) =>
  useQuery({
    queryKey: productionKeys.members(filters),
    queryFn: ({ signal }) => productionApi.members(signal, filters),
    placeholderData: keepPreviousData,
    enabled
  });

export const useTeams = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.teams(),
    queryFn: ({ signal }) => productionApi.teams(signal),
    staleTime: 5 * 60_000,
    enabled
  });

/** Clients; `filters` = CLIENT tags / custom fields (list-filters.ts), a variant under the same prefix. */
export const useClients = (enabled = true, filters: Record<string, QueryValue> = noFilters) =>
  useQuery({
    queryKey: productionKeys.clients(filters),
    queryFn: ({ signal }) => productionApi.clients(signal, filters),
    placeholderData: keepPreviousData,
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

/** Manual job status catalog (PD-038), in position order: chips, filters, pickers and its settings page. */
export const useJobStatuses = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.jobStatuses(),
    queryFn: ({ signal }) => productionApi.jobStatuses(signal),
    staleTime: 5 * 60_000,
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
      // Filtered variants of the list (tag / custom-field filters) are refetched, not patched.
      void client.invalidateQueries({
        queryKey: key,
        predicate: (query) => query.queryKey.length > key.length
      });
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
    ({ id, input }: { id: string; input: Partial<TeamInput> }) =>
      productionApi.updateTeam(id, input),
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
      ({ id, input }: { id: string; input: Partial<ClientInput> }) =>
        productionApi.updateClient(id, input),
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
      ({ id, input }: { id: string; input: Partial<ProjectInput> }) =>
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
      ({ id, input }: { id: string; input: Partial<ProcessInput> }) =>
        productionApi.updateProcess(id, input),
      related
    ),
    /** DELETE answers the remaining list (409 PROCESS_IN_USE when anything refers to it). */
    remove: useCollectionMutation(
      productionKeys.processes(),
      (id: string) => productionApi.deleteProcess(id),
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
    ({ id, input }: { id: string; input: Partial<ShiftInput> }) =>
      productionApi.updateShift(id, input)
  )
});

/**
 * "Cấu hình → Trạng thái job" (PD-038, ADMIN): every write answers the whole catalog. Jobs show the status by name and
 * colour, and a delete moves jobs to the replacement: job lists, details, the job picker and led jobs refresh.
 */
export const useJobStatusMutations = () => {
  const related = [
    productionKeys.jobs(),
    productionKeys.jobAll(),
    productionKeys.jobOptions(),
    productionKeys.timeline("jobs"),
    ["production", "led-jobs"] as const
  ];
  return {
    create: useCollectionMutation(
      productionKeys.jobStatuses(),
      (input: JobStatusCreateInput) => productionApi.createJobStatus(input),
      related
    ),
    update: useCollectionMutation(
      productionKeys.jobStatuses(),
      ({ id, input }: { id: string; input: JobStatusUpdateInput }) =>
        productionApi.updateJobStatus(id, input),
      related
    ),
    /** The ids of every status in the new order. */
    reorder: useCollectionMutation(
      productionKeys.jobStatuses(),
      (ids: string[]) => productionApi.reorderJobStatuses(ids),
      related
    ),
    /** `replacementId`: where the status' jobs go (required while jobs use it). */
    remove: useCollectionMutation(
      productionKeys.jobStatuses(),
      ({ id, replacementId }: { id: string; replacementId: string | null }) =>
        productionApi.deleteJobStatus(id, replacementId),
      related
    )
  };
};

export const useTagMutations = () => ({
  create: useCollectionMutation(productionKeys.tags(), (input: TagInput) =>
    productionApi.createTag(input)
  ),
  update: useCollectionMutation(
    productionKeys.tags(),
    ({ id, input }: { id: string; input: Partial<TagInput> }) => productionApi.updateTag(id, input)
  )
});

export const useCustomFieldMutations = () => ({
  create: useCollectionMutation(productionKeys.customFields(), (input: CustomFieldInput) =>
    productionApi.createCustomField(input)
  ),
  update: useCollectionMutation(
    productionKeys.customFields(),
    ({ id, input }: { id: string; input: Partial<CustomFieldInput> }) =>
      productionApi.updateCustomField(id, input)
  )
});

export const useStatusMutations = () => ({
  create: useCollectionMutation(productionKeys.workflow(), (input: StatusInput) =>
    productionApi.createStatus(input)
  ),
  update: useCollectionMutation(
    productionKeys.workflow(),
    ({ id, input }: { id: string; input: Partial<StatusInput> }) =>
      productionApi.updateStatus(id, input)
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
 * Drag-and-drop order of processes, shifts or custom fields: optimistic cache update, then one
 * PUT /production/{segment}/order with the ids in their new order.
 */
const useCatalogReorder = <T extends Sortable>(
  segment: "processes" | "shifts" | "custom-fields",
  key: QueryKey,
  related: readonly QueryKey[] = []
) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ordered: T[]) =>
      productionApi.reorderCatalog(
        segment,
        ordered.map((item) => item.id)
      ),
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
    onSettled: () => void invalidateAll(client, [key, ...related])
  });
};

export const useReorderProcesses = () =>
  useCatalogReorder<Process>("processes", productionKeys.processes(), [
    productionKeys.creditRules()
  ]);

export const useReorderShifts = () => useCatalogReorder<Shift>("shifts", productionKeys.shifts());

export const useReorderCustomFields = () =>
  useCatalogReorder<CustomField>("custom-fields", productionKeys.customFields());

type MemberList = { items: ProductionMember[] };

/** Replaces one member in every cached member list (plain and filtered). */
const storeMember = (client: QueryClient, member: ProductionMember) =>
  client.setQueriesData<MemberList>({ queryKey: productionKeys.members() }, (current) =>
    current
      ? { items: current.items.map((item) => (item.userId === member.userId ? member : item)) }
      : current
  );

/**
 * After an account / role change: other member lists may now match or not (filters), the person's
 * led jobs may have changed, and your own roles drive the menus (/production/me).
 */
const afterMemberChange = (client: QueryClient, member: ProductionMember, myId: string) => {
  storeMember(client, member);
  void client.invalidateQueries({ queryKey: productionKeys.members(), refetchType: "none" });
  void client.invalidateQueries({ queryKey: productionKeys.ledJobs(member.userId) });
  void client.invalidateQueries({ queryKey: productionKeys.teams() });
  if (member.userId === myId) void client.invalidateQueries({ queryKey: productionKeys.me() });
};

/**
 * Role/team/custom-field/tag changes for one member (PATCH /production/users/:id), applied
 * optimistically to every cached member list. The answer carries `orphanedJobs`: open jobs a person
 * who just lost LEADER still leads (show them, SEC2-04).
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
      const previous = client.getQueriesData<MemberList>({ queryKey: productionKeys.members() });
      client.setQueriesData<MemberList>({ queryKey: productionKeys.members() }, (current) =>
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
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    onSuccess: (result) => afterMemberChange(client, result.member, session.user.id)
  });
};

// --- Production user administration (contracts/users-admin.ts) -----------------------------------

/** POST /production/users: the new member joins the lists; the temporary password is shown once. */
export const useCreateProductionUser = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => productionApi.createUser(input),
    meta: { errorMessage: false },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: productionKeys.members() });
      void client.invalidateQueries({ queryKey: productionKeys.teams() });
      void client.invalidateQueries({ queryKey: productionKeys.allowedEmails() });
    }
  });
};

/** Vô hiệu / Kích hoạt lại: sessions end on deactivate; `orphanedJobs` lists jobs still led. */
export const useSetProductionUserActive = () => {
  const client = useQueryClient();
  const session = useSessionContext();
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      active ? productionApi.activateUser(userId) : productionApi.deactivateUser(userId),
    meta: { errorMessage: false },
    onSuccess: (result) => afterMemberChange(client, result.member, session.user.id)
  });
};

/** A new temporary password for someone else (never cached). */
export const useResetProductionUserPassword = () =>
  useMutation({
    mutationFn: (userId: string) => productionApi.resetUserPassword(userId),
    meta: { errorMessage: false }
  });

/** Open jobs a person still leads; `leaderActive` false = they need another Leader. */
export const useLedJobs = (userId: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: productionKeys.ledJobs(userId ?? ""),
    queryFn: ({ signal }) => productionApi.ledJobs(userId ?? "", signal),
    enabled: Boolean(userId) && enabled,
    retry: retryUnlessClientError
  });

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

/** DELETE /credit-rules/:id — removes an unused version; the previous one covers its period again. */
export const useDeleteCreditRule = (projectId: string, processId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => productionApi.deleteCreditRule(ruleId),
    meta: { errorMessage: false },
    onSuccess: (history) => {
      client.setQueryData(productionKeys.creditHistory(projectId, processId), history);
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
      // Provisional KPI figures and forecasts follow the close day, leave proration and the Khoán policy.
      void client.invalidateQueries({ queryKey: kpiKeys.all() });
      void client.invalidateQueries({ queryKey: scoreKeys.all() });
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
