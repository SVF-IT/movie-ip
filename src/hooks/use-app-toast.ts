"use client";

import { toast } from "sonner";

export function useAppToast() {
  return {
    success: (message: string, description?: string) =>
      toast.success(message, { description }),

    error: (message: string, description?: string) =>
      toast.error(message, { description, duration: 7000 }),

    info: (message: string, description?: string) =>
      toast.info(message, { description }),

    loading: (message: string) =>
      toast.loading(message),

    dismiss: (id?: string | number) =>
      toast.dismiss(id),
  };
}
