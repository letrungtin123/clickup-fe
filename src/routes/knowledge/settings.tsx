import { ArchivedSpaceNotice } from "@/features/knowledge/components/settings/archived-notice";
import { SpaceApprovalSection } from "@/features/knowledge/components/settings/approval-section";
import { SpaceDangerSection } from "@/features/knowledge/components/settings/danger-section";
import { SpaceGeneralSection } from "@/features/knowledge/components/settings/general-section";
import { SpaceMembersSection } from "@/features/knowledge/components/settings/members-section";
import { SpaceStatusesSection } from "@/features/knowledge/components/settings/status-editor";
import { SpaceHeader } from "@/features/knowledge/components/space-header";

import { useKnowledgeSpaceOutlet } from "./space-context";

/**
 * /k/:spaceId/settings — "Cài đặt kho" (PD-031 §09). Managers edit; everyone else (and everyone once the
 * space is archived) sees the same cards read-only. Each card is gated on its own capability: info,
 * approval and statuses on `canUpdate`, members on `canManageMembers`, archive / delete on `canArchive`.
 */
export const KnowledgeSettingsRoute = () => {
  const { space, ui } = useKnowledgeSpaceOutlet();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SpaceHeader space={space} ui={ui} title={ui.canManage ? "Cài đặt kho" : "Thông tin kho"} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 px-4 py-6 md:px-8">
          {ui.readOnly ? <ArchivedSpaceNotice space={space} canRestore={ui.canArchive} /> : null}
          <SpaceGeneralSection space={space} editable={ui.canUpdate} />
          {ui.canUpdate ? <SpaceApprovalSection space={space} /> : null}
          <SpaceMembersSection space={space} canManage={ui.canManageMembers} />
          <SpaceStatusesSection space={space} editable={ui.canUpdate} />
          {ui.canArchive ? <SpaceDangerSection space={space} /> : null}
        </div>
      </div>
    </div>
  );
};
