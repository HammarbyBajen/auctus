"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import { Chip } from "@/components/app/chip";
import { MicroLabel } from "@/components/app/micro-label";
import type { LeadCard, StageGroup } from "@/lib/leads/pipeline-view";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const chipIcon = { destructive: AlertCircle, warning: Clock, success: CheckCircle2 } as const;

function Row({ card, active, className }: { card: LeadCard; active: boolean; className?: string }) {
  return (
    <li className={className}>
      <Link
        href={`/leads/${card.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "focus-ring flex min-h-14 items-center justify-between gap-3 rounded-md px-3 py-2 transition-[background-color] hover:bg-accent",
          active && "bg-card elevation-1",
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className={cn("truncate text-sm font-medium", card.assignedElsewhere && "font-normal text-muted-foreground")}>{card.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {card.meta}
            {card.assignedElsewhere ? ` · ${card.assignedElsewhere}` : ""}
          </span>
        </span>
        {card.chip && (
          <Chip tone={card.chip.tone} icon={chipIcon[card.chip.tone]} className="shrink-0">
            {card.chip.label}
          </Chip>
        )}
      </Link>
    </li>
  );
}

/**
 * The list beside an open lead (large screens): leads that need action first,
 * then every stage in pipeline order. Won and cold stages start collapsed, as
 * they hold most of the history.
 */
export function LeadList({
  needsAction,
  groups,
  needsActionLabel,
  title,
}: {
  needsAction: LeadCard[];
  groups: StageGroup[];
  needsActionLabel: string;
  title: string;
}) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/leads/") ? pathname.split("/")[2] : null;

  return (
    <div className="hidden flex-col gap-4 lg:sticky lg:top-0 lg:flex lg:h-[calc(100dvh-1rem)] lg:overflow-y-auto lg:bg-well lg:px-3 lg:py-6">
      <Link href="/leads" className="focus-ring self-start rounded-xs px-3 text-xl font-semibold tracking-tight hover:underline">
        {title}
      </Link>
      {needsAction.length > 0 && (
        <section aria-labelledby="needs-action" className="flex flex-col gap-1">
          <MicroLabel as="h3" className="px-3">
            <span id="needs-action">{needsActionLabel}</span>
          </MicroLabel>
          <ul className="flex flex-col gap-0.5">
            {needsAction.map((card) => (
              <Row key={card.id} card={card} active={card.id === activeId} />
            ))}
          </ul>
        </section>
      )}
      {groups.map((group) => {
        const list = (
          <ul className="flex flex-col gap-0.5">
            {group.cards.map((card) => (
              <Row
                key={card.id}
                card={card}
                active={card.id === activeId}
                className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]"
              />
            ))}
          </ul>
        );
        const heading = (
          <span className="flex items-center justify-between gap-2">
            <span>{group.name}</span>
            <span className="tabular-nums">{formatNumber(group.cards.length)}</span>
          </span>
        );
        if (group.kind === "open") {
          return (
            <section key={group.key} className="flex flex-col gap-1">
              <MicroLabel as="h3" className="px-3">
                {heading}
              </MicroLabel>
              {list}
            </section>
          );
        }
        return (
          <details key={group.key} className="group flex flex-col gap-1" open={group.cards.some((c) => c.id === activeId)}>
            <summary className="focus-ring flex cursor-pointer list-none items-center gap-1 rounded-xs px-3">
              <ChevronRight aria-hidden="true" className="size-3 text-muted-foreground transition-transform group-open:rotate-90" />
              <MicroLabel className="flex-1">{heading}</MicroLabel>
            </summary>
            {list}
          </details>
        );
      })}
    </div>
  );
}

/**
 * Lays out the leads section. The pipeline (/leads) uses the full width. An open
 * lead or the new-lead form gets the list beside it from large screens up.
 */
export function LeadsShell({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/leads") return <>{children}</>;
  return (
    <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
      {list}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
