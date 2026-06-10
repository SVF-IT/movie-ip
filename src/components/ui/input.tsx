import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 h-[38px] px-3 py-1 text-[13.5px] font-[var(--font-sans)]",
        "bg-[var(--bg-raise)] text-[var(--text)] placeholder:text-[var(--text-faint)]",
        "border border-[var(--svf-border)] rounded-[9px]",
        "outline-none transition-[border-color,box-shadow] duration-200",
        "focus-visible:border-[var(--svf-accent-line)] focus-visible:ring-0",
        "file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-[var(--st-expired)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
