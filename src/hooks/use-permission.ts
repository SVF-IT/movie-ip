"use client";

import { useAuth } from "@/contexts/auth-context";
import { canPerform, type Action, type Resource } from "@/lib/permissions";

export function usePermission(action: Action, resource: Resource) {
  const { profile, loading } = useAuth();
  return {
    allowed: canPerform(profile?.role, action, resource),
    loading,
  };
}
