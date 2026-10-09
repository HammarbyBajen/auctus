import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "focus-ring flex field-sizing-content min-h-24 w-full rounded-sm control-border border bg-card px-3 py-2 text-base text-foreground transition-[border-color] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
