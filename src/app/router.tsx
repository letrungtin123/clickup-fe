import { createBrowserRouter, type RouteObject } from "react-router";

import { AppSplash, AuthGate } from "@/features/auth/components/auth-gate";
import { NotFoundRoute, RouteErrorBoundary } from "@/routes/errors";

/**
 * Route map. Every screen is code-split with `lazy`; the shell (AuthGate → AppShell) stays mounted
 * while child routes load, and a pathless error boundary keeps the sidebar usable if a page throws.
 *
 *   /login                         sign in
 *   /                              home
 *   /my-tasks                      my tasks
 *   /trash?project=                deleted tasks (restore / purge)
 *   /inbox?tab=all|unread|mentions notifications
 *   /search?q=&tab=                global search results
 *   /p/:projectId                  → first list
 *   /p/:projectId/l/:listId        list with ?view=list|board|table and ?task=<id> detail panel
 *   /p/:projectId/settings         project settings + members
 *   /c                             all conversations (mobile chat entry)
 *   /c/:channelId                  channel / DM with ?thread=<rootId> and ?message=<id>
 *   /settings/{profile,members,roles}
 *   /production                    production (retouch) overview — production roles only (PD-011)
 *   /production/clients            clients (Account)
 *   /production/settings/:page     production configuration (see features/production/nav.ts)
 */
const productionSettingsPages: Record<string, NonNullable<RouteObject["lazy"]>> = {
  members: async () => ({
    Component: (await import("@/routes/production/settings/members")).ProductionMembersRoute
  }),
  teams: async () => ({
    Component: (await import("@/routes/production/settings/teams")).ProductionTeamsRoute
  }),
  whitelist: async () => ({
    Component: (await import("@/routes/production/settings/whitelist")).ProductionWhitelistRoute
  }),
  clients: async () => ({
    Component: (await import("@/routes/production/clients")).ProductionClientsSettingsRoute
  }),
  projects: async () => ({
    Component: (await import("@/routes/production/settings/projects")).ProductionProjectsRoute
  }),
  processes: async () => ({
    Component: (await import("@/routes/production/settings/processes")).ProductionProcessesRoute
  }),
  shifts: async () => ({
    Component: (await import("@/routes/production/settings/shifts")).ProductionShiftsRoute
  }),
  "credit-rules": async () => ({
    Component: (await import("@/routes/production/settings/credit-rules")).ProductionCreditRulesRoute
  }),
  workflow: async () => ({
    Component: (await import("@/routes/production/settings/workflow")).ProductionWorkflowRoute
  }),
  "custom-fields": async () => ({
    Component: (await import("@/routes/production/settings/custom-fields"))
      .ProductionCustomFieldsRoute
  }),
  tags: async () => ({
    Component: (await import("@/routes/production/settings/tags")).ProductionTagsRoute
  }),
  general: async () => ({
    Component: (await import("@/routes/production/settings/general")).ProductionGeneralRoute
  })
};

export const routes: RouteObject[] = [
  {
    path: "/login",
    lazy: async () => ({ Component: (await import("@/routes/login")).LoginRoute }),
    hydrateFallbackElement: <AppSplash label="Đang tải" />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: "/",
    element: <AuthGate />,
    hydrateFallbackElement: <AppSplash />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import("@/routes/home")).HomeRoute })
          },
          {
            path: "my-tasks",
            lazy: async () => ({ Component: (await import("@/routes/my-tasks")).MyTasksRoute })
          },
          {
            path: "trash",
            lazy: async () => ({ Component: (await import("@/routes/trash")).TrashRoute })
          },
          {
            path: "inbox",
            lazy: async () => ({ Component: (await import("@/routes/inbox")).InboxRoute })
          },
          {
            path: "search",
            lazy: async () => ({ Component: (await import("@/routes/search")).SearchRoute })
          },
          {
            path: "p/:projectId",
            lazy: async () => ({
              Component: (await import("@/routes/project")).ProjectLayoutRoute
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import("@/routes/project")).ProjectIndexRoute
                })
              },
              {
                path: "l/:listId",
                lazy: async () => ({ Component: (await import("@/routes/project")).ListRoute })
              },
              {
                path: "settings",
                lazy: async () => ({
                  Component: (await import("@/routes/project-settings")).ProjectSettingsRoute
                })
              }
            ]
          },
          {
            path: "c",
            lazy: async () => ({ Component: (await import("@/routes/channel")).ChannelsIndexRoute })
          },
          {
            path: "c/:channelId",
            lazy: async () => ({ Component: (await import("@/routes/channel")).ChannelRoute })
          },
          {
            path: "production",
            lazy: async () => ({
              Component: (await import("@/routes/production/layout")).ProductionLayoutRoute
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import("@/routes/production/overview")).ProductionOverviewRoute
                })
              },
              {
                path: "clients",
                lazy: async () => ({
                  Component: (await import("@/routes/production/clients")).ProductionClientsRoute
                })
              },
              {
                path: "settings",
                lazy: async () => ({
                  Component: (await import("@/routes/production/settings/layout"))
                    .ProductionSettingsLayoutRoute
                }),
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import("@/routes/production/settings/layout"))
                        .ProductionSettingsIndexRoute
                    })
                  },
                  ...Object.entries(productionSettingsPages).map(([path, lazy]) => ({ path, lazy })),
                  { path: "*", element: <NotFoundRoute /> }
                ]
              },
              { path: "*", element: <NotFoundRoute /> }
            ]
          },
          {
            path: "settings",
            lazy: async () => ({
              Component: (await import("@/routes/settings/layout")).SettingsLayoutRoute
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import("@/routes/settings/layout")).SettingsIndexRoute
                })
              },
              {
                path: "profile",
                lazy: async () => ({
                  Component: (await import("@/routes/settings/profile")).ProfileSettingsRoute
                })
              },
              {
                path: "members",
                lazy: async () => ({
                  Component: (await import("@/routes/settings/members")).MembersSettingsRoute
                })
              },
              {
                path: "roles",
                lazy: async () => ({
                  Component: (await import("@/routes/settings/roles")).RolesSettingsRoute
                })
              }
            ]
          },
          { path: "*", element: <NotFoundRoute /> }
        ]
      }
    ]
  }
];

export const createAppRouter = () => createBrowserRouter(routes);
