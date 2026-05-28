import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  /** ms before auto-dismiss; 0 = sticky */
  duration?: number;
  /** Optional CTA */
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 1;
const uid = () => `t-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = uid();
    const toast: Toast = { id, duration: 3500, ...t };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.duration) {
      window.setTimeout(() => get().dismiss(id), toast.duration);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Convenience helpers usable from any module */
export const toast = {
  info: (title: string, body?: string) =>
    useToastStore.getState().push({ kind: 'info', title, body }),
  success: (title: string, body?: string) =>
    useToastStore.getState().push({ kind: 'success', title, body }),
  warn: (title: string, body?: string) =>
    useToastStore.getState().push({ kind: 'warn', title, body }),
  error: (title: string, body?: string) =>
    useToastStore.getState().push({ kind: 'error', title, body, duration: 6000 }),
};
