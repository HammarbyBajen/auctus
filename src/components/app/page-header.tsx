import { cn } from "@/lib/utils";

/** A page title in the brand's heading face, with an optional action on the right. */
export function PageHeader({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <h1 className="heading-display min-w-0 text-3xl break-words sm:text-4xl">{title}</h1>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

/** A section heading in Abel uppercase, the brand's secondary type. */
export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("label-caps text-lg text-foreground", className)}>{children}</h2>;
}
