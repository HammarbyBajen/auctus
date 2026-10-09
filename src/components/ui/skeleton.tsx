import { cn } from "@/lib/utils";

/** A placeholder block. Still, never pulsing: no looping animation anywhere (docs/DESIGN.md, section 8). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("rounded-xs bg-muted", className)} {...props} />;
}

export { Skeleton };
