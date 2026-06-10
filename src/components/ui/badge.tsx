import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-colors overflow-hidden tracking-[0.01em]",
  {
    variants: {
      variant: {
        default:
          "bg-(--svf-accent) border-transparent text-white",
        secondary:
          "bg-(--bg-raise) border-(--svf-border) text-(--text-dim)",
        destructive:
          "bg-[color-mix(in_oklch,var(--st-expired)_13%,transparent)] border-[color-mix(in_oklch,var(--st-expired)_28%,transparent)] text-(--st-expired)",
        outline:
          "border-(--svf-border) text-(--text-dim)",
        ghost:
          "border-transparent text-(--text-faint) bg-(--hover)",
        link:
          "text-(--svf-accent-bright) border-transparent underline-offset-4 hover:underline",
        success:
          "bg-[color-mix(in_oklch,var(--st-active)_13%,transparent)] border-[color-mix(in_oklch,var(--st-active)_28%,transparent)] text-(--st-active)",
        warning:
          "bg-[color-mix(in_oklch,var(--st-expiring)_13%,transparent)] border-[color-mix(in_oklch,var(--st-expiring)_28%,transparent)] text-(--st-expiring)",
        info:
          "bg-[color-mix(in_oklch,var(--st-open)_13%,transparent)] border-[color-mix(in_oklch,var(--st-open)_28%,transparent)] text-(--st-open)",
        purple:
          "bg-[color-mix(in_oklch,var(--st-wtp)_13%,transparent)] border-[color-mix(in_oklch,var(--st-wtp)_28%,transparent)] text-(--st-wtp)",
        pink:
          "bg-pink-900/30 border-pink-700/40 text-pink-300",
        cyan:
          "bg-[color-mix(in_oklch,var(--st-open)_13%,transparent)] border-[color-mix(in_oklch,var(--st-open)_28%,transparent)] text-(--st-open)",
        orange:
          "bg-[color-mix(in_oklch,var(--st-expiring)_13%,transparent)] border-[color-mix(in_oklch,var(--st-expiring)_28%,transparent)] text-(--st-expiring)",
        emerald:
          "bg-[color-mix(in_oklch,var(--st-active)_13%,transparent)] border-[color-mix(in_oklch,var(--st-active)_28%,transparent)] text-(--st-active)",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
