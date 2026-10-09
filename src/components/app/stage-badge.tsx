import { cn } from "@/lib/utils";

/** A pipeline stage: green when the person became a member, grey when cold, plain while open. */
export function StageBadge({ name, kind, className }: { name: string; kind: string; className?: string }) {
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center rounded-sm border px-2 py-0.5 text-sm",
        kind === "won" && "border-success-border bg-success-surface text-success-text",
        kind === "cold" && "border-border bg-muted text-muted-foreground",
        kind === "open" && "border-border bg-card text-foreground",
        className,
      )}
    >
      {name}
    </span>
  );
}
