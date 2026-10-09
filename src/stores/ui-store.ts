import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Global client-only UI state (tech-stack §16). Server data never lives here. */
type UiState = {
  /** Desktop: user collapsed the sidebar to the icon rail. */
  sidebarCollapsed: boolean;
  /** Tablet: rail temporarily expanded as an overlay. Mobile: drawer open. */
  navOverlayOpen: boolean;
  commandOpen: boolean;
  newProjectOpen: boolean;
  /** Project ids whose list tree is collapsed in the sidebar. */
  collapsedProjects: Record<string, true>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setNavOverlayOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setNewProjectOpen: (open: boolean) => void;
  setProjectExpanded: (projectId: string, expanded: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      navOverlayOpen: false,
      commandOpen: false,
      newProjectOpen: false,
      collapsedProjects: {},
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setNavOverlayOpen: (navOverlayOpen) => set({ navOverlayOpen }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
      setProjectExpanded: (projectId, expanded) =>
        set((state) => {
          const collapsedProjects = { ...state.collapsedProjects };
          if (expanded) {
            delete collapsedProjects[projectId];
          } else {
            collapsedProjects[projectId] = true;
          }
          return { collapsedProjects };
        })
    }),
    {
      name: "nesso-work-ui",
      version: 1,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedProjects: state.collapsedProjects
      })
    }
  )
);
