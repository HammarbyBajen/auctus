/**
 * A key number with its label, numbers aligned for comparison. On a phone the
 * tile is compact and uses the short label, so the list below stays in view.
 */
export function Stat({ value, label, shortLabel }: { value: number | string; label: string; shortLabel?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2 sm:gap-1 sm:px-4 sm:py-3">
      <dd className="heading-display text-2xl tabular-nums sm:text-4xl">{value}</dd>
      <dt className="text-xs leading-tight text-muted-foreground sm:text-sm">
        {shortLabel ? (
          <>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </dt>
    </div>
  );
}
