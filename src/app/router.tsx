import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

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
 *   /inbox?tab=all|unread|mentions notifications (/notifications redirects here; the header bell
 *                                  shows the 10 newest)
 *   /search?q=&tab=                global search results
 *   /p/:projectId                  → first list
 *   /p/:projectId/l/:listId        list with ?view=list|board|table and ?task=<id> detail panel
 *   /p/:projectId/settings         project settings + members
 *   /k                             knowledge base: every space (knowledge.view, PD-031)
 *   /k/:spaceId                    space: category tree + items (filters in the URL)
 *   /k/:spaceId/new                new item (editor)
 *   /k/:spaceId/i/:itemId          item (reader: TOC, comments, history; ?tab=comments|history)
 *   /k/:spaceId/i/:itemId/edit     item editor (versions, conflict handling)
 *   /k/:spaceId/{settings,audit,trash}  space settings / audit log / trash
 *   /c                             all conversations (mobile chat entry)
 *   /c/:channelId                  channel / DM with ?thread=<rootId> and ?message=<id>
 *   /settings/{profile,members,roles}
 *   /production                    "Tổng quan" Overview V2 (PD-080: Leader / Account / Quản trị / Director; Staff and QC
 *                                  are sent to /production/my-tasks); ?from=&to=&scope=&card=&sub=
 *   /production/at-risk            At risk history (PD-080: superadmin / Director); ?from=&to=
 *   /production/my-overview        "Tổng quan của tôi" (PD-081: own tasks and points, every member; Staff / QC landing)
 *   /production/clients            clients (Account)
 *   /production/projects           Project list (PD-078: Leader / Admin create and edit, Director / Account read;
 *                                  /production/settings/projects redirects here)
 *   /production/jobs[/:jobId]      jobs (filters in the URL) / job detail; ?task=<id> opens a task sheet
 *   /production/my-tasks, /qc      my tasks (kanban) / QC queue
 *   /production/tasks/:taskId      shareable task page (notification and e-mail links)
 *   /production/scores            Bảng điểm: my scores & KPI forecast (?period=&tab=settled|team; team = "Toàn đội", PD-069)
 *   /production/scores/board       retired ranking: redirects to /production/scores?tab=team (keeps period / team / people filter)
 *   /production/scores/person/:userId  "Điểm cá nhân" of any member (PD-052; ?period=&tab=settled)
 *   /production/leave              shared leave calendar (?month=&tab=)
 *   /production/dashboard          Leader dashboard (?leader= for ADMIN)
 *   /production/admin              Admin dashboard (6 cards + pinned reports)
 *   /production/reports            report builder (?config=|?saved=, ?title=)
 *   /production/anomalies          anomalies (?kind=&days=&reviewed=1)
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
  "job-permissions": async () => ({
    Component: (await import("@/routes/production/settings/job-permissions"))
      .ProductionJobPermissionsRoute
  }),
  clients: async () => ({
    Component: (await import("@/routes/production/clients")).ProductionClientsSettingsRoute
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
  "job-statuses": async () => ({
    Component: (await import("@/routes/production/settings/job-statuses"))
      .ProductionJobStatusesRoute
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
  }),
  kpi: async () => ({
    Component: (await import("@/routes/production/settings/kpi")).ProductionKpiTargetsRoute
  }),
  "kpi-settlement": async () => ({
    Component: (await import("@/routes/production/settings/kpi-settlement"))
      .ProductionKpiSettlementRoute
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
            path: "notifications",
            lazy: async () => ({
              Component: (await import("@/routes/inbox")).NotificationsRedirectRoute
            })
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
            path: "k",
            lazy: async () => ({
              Component: (await import("@/routes/knowledge/layout")).KnowledgeGateRoute
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import("@/routes/knowledge/layout")).KnowledgeHomeRoute
                })
              },
              {
                path: ":spaceId",
                lazy: async () => ({
                  Component: (await import("@/routes/knowledge/layout")).KnowledgeSpaceLayoutRoute
                }),
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import("@/routes/knowledge/space")).KnowledgeSpaceRoute
                    })
                  },
                  {
                    path: "new",
                    lazy: async () => ({
                      Component: (await import("@/routes/knowledge/editor")).KnowledgeNewItemRoute
                    })
                  },
                  {
                    path: "i/:itemId",
                    lazy: async () => ({
                      Component: (await import("@/routes/knowledge/item")).KnowledgeItemRoute
                    })
                  },
                  {
                    path: "i/:itemId/edit",
                    lazy: async () => ({
                      Component: (await import("@/routes/knowledge/editor")).KnowledgeEditItemRoute
                    })
                  },
                  {
                    path: "settings",
                    lazy: async () => ({
                      Component: (await import("@/routes/knowledge/settings")).KnowledgeSettingsRoute
                    })
                  },
                  {
                    path: "audit",
                    lazy: async () => ({
                      Component: (await import("@/routes/knowledge/audit")).KnowledgeAuditRoute
                    })
                  },
                  {
                    path: "trash",
                    lazy: async () => ({
                      Component: (await import("@/routes/knowledge/trash")).KnowledgeTrashRoute
                    })
                  },
                  {
                    path: ":itemId",
                    lazy: async () => ({
                      Component: (await import("@/routes/knowledge/layout")).KnowledgeItemShortcutRoute
                    })
                  },
                  { path: "*", element: <NotFoundRoute /> }
                ]
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
                path: "at-risk",
                lazy: async () => ({
                  Component: (await import("@/routes/production/at-risk")).ProductionAtRiskRoute
                })
              },
              {
                path: "my-overview",
                lazy: async () => ({
                  Component: (await import("@/routes/production/my-overview")).ProductionMyOverviewRoute
                })
              },
              {
                path: "clients",
                lazy: async () => ({
                  Component: (await import("@/routes/production/clients")).ProductionClientsRoute
                })
              },
              {
                path: "projects",
                lazy: async () => ({
                  Component: (await import("@/routes/production/projects")).ProductionProjectsRoute
                })
              },
              {
                path: "jobs",
                lazy: async () => ({
                  Component: (await import("@/routes/production/jobs")).ProductionJobsRoute
                })
              },
              {
                path: "jobs/:jobId",
                lazy: async () => ({
                  Component: (await import("@/routes/production/job")).ProductionJobRoute
                })
              },
              {
                path: "my-tasks",
                lazy: async () => ({
                  Component: (await import("@/routes/production/my-tasks")).ProductionMyTasksRoute
                })
              },
              {
                path: "qc",
                lazy: async () => ({
                  Component: (await import("@/routes/production/qc")).ProductionQcRoute
                })
              },
              {
                path: "tasks/:taskId",
                lazy: async () => ({
                  Component: (await import("@/routes/production/task")).ProductionTaskRoute
                })
              },
              {
                path: "scores",
                lazy: async () => ({
                  Component: (await import("@/routes/production/scores")).ProductionScoresRoute
                })
              },
              {
                path: "scores/board",
                lazy: async () => ({
                  Component: (await import("@/routes/production/scores-board"))
                    .ProductionScoreBoardRoute
                })
              },
              {
                path: "scores/person/:userId",
                lazy: async () => ({
                  Component: (await import("@/routes/production/scores-person"))
                    .ProductionScorePersonRoute
                })
              },
              {
                path: "leave",
                lazy: async () => ({
                  Component: (await import("@/routes/production/leave")).ProductionLeaveRoute
                })
              },
              {
                path: "dashboard",
                lazy: async () => ({
                  Component: (await import("@/routes/production/dashboard")).ProductionDashboardRoute
                })
              },
              {
                path: "admin",
                lazy: async () => ({
                  Component: (await import("@/routes/production/admin")).ProductionAdminDashboardRoute
                })
              },
              {
                path: "reports",
                lazy: async () => ({
                  Component: (await import("@/routes/production/reports")).ProductionReportsRoute
                })
              },
              {
                path: "anomalies",
                lazy: async () => ({
                  Component: (await import("@/routes/production/anomalies")).ProductionAnomaliesRoute
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
                  // PD-078: Project left Cấu hình (its own page).
                  { path: "projects", element: <Navigate to="/production/projects" replace /> },
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
