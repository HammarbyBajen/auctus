import { cn } from "@/lib/utils";

/** The shared empty state: a muted mark, an sm title, an xs description and one clear action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-lg bg-well px-5 py-8", className)}>
      <span className="flex size-10 items-center justify-center rounded-md bg-card text-muted-foreground elevation-1">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
