import { cn } from "@/lib/utils";

/** The micro label: 10 px uppercase with the one label tracking. Column heads, small section labels. */
export function MicroLabel({ children, className, as: Tag = "span" }: { children: React.ReactNode; className?: string; as?: "span" | "p" | "dt" | "th" | "h3" }) {
  return (
    <Tag className={cn("text-3xs font-medium tracking-[var(--tracking-label)] text-muted-foreground uppercase", className)}>
      {children}
    </Tag>
  );
}
