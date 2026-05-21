import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        success:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 [a&]:hover:bg-emerald-200",
        warning:
          "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 [a&]:hover:bg-amber-200",
        info:
          "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 [a&]:hover:bg-blue-200",
        purple:
          "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 [a&]:hover:bg-purple-200",
        pink:
          "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 [a&]:hover:bg-pink-200",
        cyan:
          "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 [a&]:hover:bg-cyan-200",
        orange:
          "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 [a&]:hover:bg-orange-200",
        emerald:
          "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 [a&]:hover:bg-green-200",
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
