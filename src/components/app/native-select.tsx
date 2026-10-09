import { cn } from "@/lib/utils";

/**
 * A native select styled like the inputs. On a phone it opens the system
 * picker. Background and text colours are explicit tokens, so it stays legible
 * in Windows dark mode.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "focus-ring h-11 w-full min-w-0 rounded-sm control-border border bg-card px-3 text-base text-foreground sm:h-9 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
