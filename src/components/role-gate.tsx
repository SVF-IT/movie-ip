"use client";

import type { ReactNode } from "react";
import { usePermission } from "@/hooks/use-permission";
import type { Action, Resource } from "@/lib/permissions";

interface RoleGateProps {
  action: Action;
  resource: Resource;
  children: ReactNode;
  /** What to render when access is denied. Defaults to nothing. */
  fallback?: ReactNode;
}

export function RoleGate({
  action,
  resource,
  children,
  fallback = null,
}: RoleGateProps) {
  const { allowed, loading } = usePermission(action, resource);

  if (loading) return null;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
