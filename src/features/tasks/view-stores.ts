import { create } from "zustand";

import type { DropPosition } from "./placement";

/**
 * Tiny stores for high-frequency view state. Rows subscribe with narrow selectors so a moving drop
 * indicator or keyboard focus only re-renders the two rows involved, never the whole list.
 */

export type DropIndicator = { groupId: string; overId: string | null; position: DropPosition };

type DropState = {
  target: DropIndicator | null;
  setTarget: (target: DropIndicator | null) => void;
};

export const useDropStore = create<DropState>((set, get) => ({
  target: null,
  setTarget: (target) => {
    const current = get().target;
    if (
      current?.groupId === target?.groupId &&
      current?.overId === target?.overId &&
      current?.position === target?.position
    ) {
      return;
    }
    set({ target });
  }
}));

type FocusState = {
  focusedId: string | null;
  /** True when focus was moved by the keyboard: the row should take DOM focus when it renders. */
  pull: boolean;
  focus: (id: string | null, pull?: boolean) => void;
};

export const useRowFocusStore = create<FocusState>((set) => ({
  focusedId: null,
  pull: false,
  focus: (focusedId, pull = false) => set({ focusedId, pull })
}));
