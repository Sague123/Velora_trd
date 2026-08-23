import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().push({ kind: "success", title, message }),
  error: (title: string, message?: string) => useToastStore.getState().push({ kind: "error", title, message }),
  info: (title: string, message?: string) => useToastStore.getState().push({ kind: "info", title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().push({ kind: "warning", title, message }),
};
