import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "focus-ring h-11 w-full min-w-0 rounded-sm control-border border bg-card px-3 py-1 text-base text-foreground transition-[border-color] placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:h-9 sm:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
