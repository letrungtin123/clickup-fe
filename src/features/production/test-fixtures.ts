import type { ProductionProject } from "@/contracts/production-catalog";

/**
 * Test data builders for the production module (tests only; made-up codes and names — the repository is public).
 * PD-078 / PD-079: a Project carries its owners (in order; `owner` = the first), creator, job counts and the caller's
 * capabilities.
 */
export const projectFixture = (
  overrides: Partial<ProductionProject> & Pick<ProductionProject, "id" | "code" | "name">
): ProductionProject => {
  const owners = overrides.owners ?? (overrides.owner ? [overrides.owner] : []);
  return {
    description: null,
    clientId: null,
    clientName: null,
    qcBufferHours: 0,
    active: true,
    createdBy: null,
    createdAt: "2026-10-01T01:00:00.000Z",
    jobCount: 0,
    hasJobs: false,
    capabilities: { canEdit: false, canChangeOwner: false, ownerEdit: "none", canDelete: false },
    ...overrides,
    owners,
    owner: owners[0] ?? null
  };
};
