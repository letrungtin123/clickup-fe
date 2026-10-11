import { useOutletContext } from "react-router";

import type { KnowledgeSpaceDetail } from "@/contracts/knowledge";
import type { SpaceUi } from "@/features/knowledge/model/access";

export type KnowledgeSpaceOutletContext = { space: KnowledgeSpaceDetail; ui: SpaceUi };

/** The resolved space + its UX gates, provided by KnowledgeSpaceLayoutRoute to /k/:spaceId/* children. */
export const useKnowledgeSpaceOutlet = () => useOutletContext<KnowledgeSpaceOutletContext>();
