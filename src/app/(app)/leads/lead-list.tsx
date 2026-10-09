"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Chip } from "@/components/app/chip";
import { MicroLabel } from "@/components/app/micro-label";
import { cn } from "@/lib/utils";

export type LeadRow = {
  id: string;
  name: string;
  meta: string;
  assignedElsewhere: string | null;
  chip: { tone: "destructive" | "warning" | "success"; label: string } | null;
};

const chipIcon = { destructive: AlertCircle, warning: Clock, success: CheckCircle2 } as const;

function Row({ row, active, className }: { row: LeadRow; active: boolean; className?: string }) {
  return (
    <li className={className}>
      <Link
        href={`/leads/${row.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "focus-ring flex min-h-14 items-center justify-between gap-3 rounded-md px-3 py-2 transition-[background-color] hover:bg-accent",
          active && "bg-card elevation-1",
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className={cn("truncate text-sm font-medium", row.assignedElsewhere && "font-normal text-muted-foreground")}>
            {row.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {row.meta}
            {row.assignedElsewhere ? ` · ${row.assignedElsewhere}` : ""}
          </span>
        </span>
        {row.chip && (
          <Chip tone={row.chip.tone} icon={chipIcon[row.chip.tone]} className="shrink-0">
            {row.chip.label}
          </Chip>
        )}
      </Link>
    </li>
  );
}

/**
 * The list side of the leads split pane. On a phone it is the whole screen at
 * /leads and hidden once a lead is open; from large screens up it stays on the left.
 */
export function LeadList({
  title,
  needsAction,
  all,
  needsActionLabel,
  allLabel,
}: {
  title: string;
  needsAction: LeadRow[];
  all: LeadRow[];
  needsActionLabel: string;
  allLabel: string;
}) {
  const pathname = usePathname();
  const onList = pathname === "/leads";
  const activeId = pathname.startsWith("/leads/") ? pathname.split("/")[2] : null;

  return (
    <div
      className={cn(
        "flex-col gap-4 px-4 py-6 sm:px-6 lg:sticky lg:top-0 lg:flex lg:h-[calc(100dvh-1rem)] lg:overflow-y-auto lg:bg-well lg:px-3 lg:py-6",
        onList ? "flex" : "hidden",
      )}
    >
      <h1 className="px-1 text-xl font-semibold tracking-tight lg:px-3">{title}</h1>
      {needsAction.length > 0 && (
        <section aria-labelledby="needs-action" className="flex flex-col gap-1">
          <MicroLabel as="h3" className="px-3">
            <span id="needs-action">{needsActionLabel}</span>
          </MicroLabel>
          <ul className="flex flex-col gap-0.5">
            {needsAction.map((row) => (
              <Row key={row.id} row={row} active={row.id === activeId} />
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="all-leads" className="flex flex-col gap-1">
        <MicroLabel as="h3" className="px-3">
          <span id="all-leads">{allLabel}</span>
        </MicroLabel>
        <ul className="flex flex-col gap-0.5">
          {all.map((row) => (
            <Row
              key={row.id}
              row={row}
              active={row.id === activeId}
              className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]"
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The detail side: hidden on a phone while the list is showing. */
export function LeadDetailPane({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className={cn("min-w-0", pathname === "/leads" ? "hidden lg:block" : "block")}>{children}</div>;
}
