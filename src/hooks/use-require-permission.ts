"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermission } from "@/hooks/use-permission";
import type { Action, Resource } from "@/lib/permissions";

/**
 * Hook that checks if the user has permission to perform an action on a resource.
 * If not permitted, redirects to the specified fallback path.
 * Returns { allowed, loading } for the component to render loading/denied states.
 */
export function useRequirePermission(
  action: Action,
  resource: Resource,
  redirectTo: string = "/"
) {
  const { allowed, loading } = usePermission(action, resource);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace(redirectTo);
    }
  }, [loading, allowed, router, redirectTo]);

  return { allowed, loading };
}
