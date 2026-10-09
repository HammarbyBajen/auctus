import { cn } from "@/lib/utils";

/**
 * A native select, styled to match the inputs. On a phone it opens the system
 * picker, which is the easiest to use. Colours are explicit so it stays legible
 * in Windows dark mode.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground transition-[border-color,box-shadow] outline-none focus-visible:border-tegen-mid-green focus-visible:ring-3 focus-visible:ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}
