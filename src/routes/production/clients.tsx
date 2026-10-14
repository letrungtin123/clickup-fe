import { motion } from "motion/react";

import { PageHeader } from "@/components/shared/page-header";
import { ClientsPanel } from "@/features/production/components/clients-panel";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { PageIntro, SettingsPage } from "@/features/production/components/settings-kit";

/** /production/clients — the Account's client list (SPEC Phase 0 menu: ACCOUNT → Clients). */
export const ProductionClientsRoute = () => (
  <RequireProductionRole roles={["ACCOUNT"]}>
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
          <ClientsPanel />
        </motion.div>
      </div>
    </div>
  </RequireProductionRole>
);

/** /production/settings/clients — the same list inside the configuration area. */
export const ProductionClientsSettingsRoute = () => (
  <SettingsPage>
    <PageIntro slug="clients" />
    <ClientsPanel />
  </SettingsPage>
);
