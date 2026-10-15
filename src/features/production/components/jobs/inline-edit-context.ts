import { createContext, use } from "react";

/** One field in edit mode at a time on a task page (see inline-field.tsx). */
export type InlineEditScopeValue = {
  active: string | null;
  setActive: (key: string | null) => void;
};

export const InlineEditContext = createContext<InlineEditScopeValue | null>(null);

/** Whether the field `editKey` is open in the enclosing scope (a row can reflow around its editor). */
export const useInlineEditActive = (editKey: string) => use(InlineEditContext)?.active === editKey;
