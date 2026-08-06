"use client";

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { usePermission } from "@/hooks/use-permission";
import type { Action, Resource } from "@/lib/permissions";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RoleGateProps {
  action: Action;
  resource: Resource;
  children: ReactNode;
  /** What to render when access is denied. Defaults to nothing. */
  fallback?: ReactNode;
  /**
   * When true (and no custom `fallback` is given), instead of hiding `children`
   * entirely, renders them disabled with a tooltip explaining why the action
   * isn't available to the current role. `children` must be a single element
   * that accepts a `disabled` prop (e.g. a Button).
   */
  showDisabledFallback?: boolean;
  /** Custom tooltip text for the disabled fallback. Defaults to a generic permission message. */
  disabledReason?: string;
}

export function RoleGate({
  action,
  resource,
  children,
  fallback = null,
  showDisabledFallback = false,
  disabledReason,
}: RoleGateProps) {
  const { allowed, loading } = usePermission(action, resource);

  if (loading) return null;
  if (!allowed) {
    if (showDisabledFallback && isValidElement(children)) {
      const reason = disabledReason ?? "You don't have permission to perform this action.";
      const disabledChild = cloneElement(children as ReactElement<{ disabled?: boolean }>, { disabled: true });
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block cursor-not-allowed">
              <span className="pointer-events-none">{disabledChild}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      );
    }
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
