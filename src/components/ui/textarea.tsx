import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[80px] w-full px-3 py-2 text-[13.5px]",
        "bg-(--bg-raise) text-(--text) placeholder:text-(--text-faint)",
        "border border-(--svf-border) rounded-[9px]",
        "outline-none transition-[border-color] duration-200",
        "focus-visible:border-(--svf-accent-line)",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-(--st-expired)",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
