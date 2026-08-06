"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DisabledActionButtonProps {
  children: ReactNode;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost";
  reason?: string;
}

/**
 * A visually-styled but non-functional stand-in for an action button, used as
 * a RoleGate `fallback` for buttons that navigate via an `asChild` Link (where
 * a real `disabled` prop can't block navigation). Shows a tooltip explaining
 * why the action isn't available.
 */
export function DisabledActionButton({
  children,
  className,
  size = "sm",
  variant = "default",
  reason = "You don't have permission to perform this action.",
}: DisabledActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block cursor-not-allowed">
          <Button type="button" size={size} variant={variant} disabled className={className}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
