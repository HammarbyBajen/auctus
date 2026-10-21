import { cn } from "@/lib/utils";

/**
 * The frame every Tier 2 screen sits in: page padding on the 4 px grid, a
 * left-aligned xl title (never display type on a workhorse screen) and an
 * optional action area. Content leads; the header stays compact.
 */
export function Page({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8", className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight break-words">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex max-w-full shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** A section heading inside a page (lg, tight tracking). */
export function SectionTitle({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cn("text-lg font-semibold tracking-tight", className)}>
      {children}
    </h2>
  );
}
