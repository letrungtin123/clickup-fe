import { create } from "zustand";

/**
 * Promise-based confirmation (parent completion WARN, purge…). Any mounted <ConfirmHost/> may render
 * the dialog; the first registered host wins so stacked hosts never show duplicates.
 */
export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };

type ConfirmState = {
  request: ConfirmRequest | null;
  hosts: string[];
};

export const useConfirmStore = create<ConfirmState>(() => ({ request: null, hosts: [] }));

export const registerConfirmHost = (id: string) => {
  useConfirmStore.setState((state) => ({ hosts: [...state.hosts, id] }));
  return () => useConfirmStore.setState((state) => ({ hosts: state.hosts.filter((host) => host !== id) }));
};

export const settleConfirm = (ok: boolean) => {
  const { request } = useConfirmStore.getState();
  useConfirmStore.setState({ request: null });
  request?.resolve(ok);
};

export const confirmAction = (options: ConfirmOptions): Promise<boolean> => {
  const state = useConfirmStore.getState();
  if (state.hosts.length === 0) {
    return Promise.resolve(window.confirm(`${options.title}\n\n${options.description}`));
  }
  state.request?.resolve(false);
  return new Promise((resolve) => useConfirmStore.setState({ request: { ...options, resolve } }));
};
