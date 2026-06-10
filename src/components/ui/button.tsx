import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--svf-accent-line)] focus-visible:ring-offset-1 cursor-pointer letter-spacing-[0.01em]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--svf-accent)] text-white hover:bg-[var(--svf-accent-bright)] shadow-[0_6px_18px_-8px_var(--svf-accent)] rounded-[9px]",
        destructive:
          "bg-[var(--st-expired)] text-white hover:opacity-90 rounded-[9px]",
        outline:
          "border border-[var(--svf-border-strong)] bg-transparent text-[var(--text)] hover:bg-[var(--hover)] rounded-[9px]",
        secondary:
          "bg-[var(--bg-raise)] text-[var(--text)] border border-[var(--svf-border-strong)] hover:bg-[var(--hover)] rounded-[9px]",
        ghost:
          "text-[var(--text-dim)] hover:bg-[var(--hover)] hover:text-[var(--text)] rounded-[9px]",
        link: "text-[var(--svf-accent-bright)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[38px] px-[14px] text-[13.5px]",
        xs:      "h-[28px] gap-1 px-[8px]  text-xs  rounded-[7px]",
        sm:      "h-[32px] gap-1.5 px-[11px] text-[12.5px]",
        lg:      "h-[46px] px-6   text-[15px]",
        icon:    "size-[38px]",
        "icon-xs": "size-6 rounded-[7px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
