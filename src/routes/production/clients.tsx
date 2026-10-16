import { motion } from "motion/react";

import { PageHeader } from "@/components/shared/page-header";
import { ClientsPanel } from "@/features/production/components/clients-panel";
import { RequireProductionFeature } from "@/features/production/components/production-gate";
import {
  ConfigReadOnlyNote,
  PageIntro,
  SettingsPage
} from "@/features/production/components/settings-kit";
import { useCanEditProductionConfig } from "@/features/production/config-access";

/**
 * /production/clients — the Account's client list (SPEC Phase 0 menu: ACCOUNT → Clients). PD-050: read-only for
 * everyone but the organization superadmin; this page has no PageIntro, so it shows the read-only note itself. Opens for
 * whoever holds the "Khách hàng" feature (PD-065).
 */
export const ProductionClientsRoute = () => {
  const canEdit = useCanEditProductionConfig();
  return (
    <RequireProductionFeature feature="clients">
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          eyebrow="Photo Retouch"
          title="Khách hàng"
          description="Khách hàng đặt job, kèm trường tùy chỉnh và tag."
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 md:px-6 md:py-6"
          >
            {canEdit ? null : <ConfigReadOnlyNote />}
            <ClientsPanel />
          </motion.div>
        </div>
      </div>
    </RequireProductionFeature>
  );
};

/** /production/settings/clients — the same list inside the configuration area. */
export const ProductionClientsSettingsRoute = () => (
  <SettingsPage>
    <PageIntro slug="clients" />
    <ClientsPanel />
  </SettingsPage>
);
