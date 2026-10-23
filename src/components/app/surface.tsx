import { cn } from "@/lib/utils";

/**
 * Content that steps up from the canvas: the card lightness, the radius-lg
 * corner and elevation-1 (shadow plus the inset top light). Never a 1px
 * outline as the only separation.
 */
export function Surface({
  children,
  className,
  as: Tag = "section",
  ...props
}: { children: React.ReactNode; className?: string; as?: "section" | "div" | "article" | "li" | "nav" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("rounded-lg bg-card text-card-foreground elevation-1", className)} {...props}>
      {children}
    </Tag>
  );
}

/** A surface with a title row and padded body. */
export function Panel({
  title,
  action,
  children,
  className,
  id,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Surface className={cn("flex flex-col", className)} aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 id={id} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {action}
      </div>
      <div className="flex flex-col gap-4 p-4 sm:px-5 sm:pb-5">{children}</div>
    </Surface>
  );
}

/** A trough content sits in (lists inside a pane). Never nested in another well. */
export function Well({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-well-border bg-well", className)}>{children}</div>;
}
