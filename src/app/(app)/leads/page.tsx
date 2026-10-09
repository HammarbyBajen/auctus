import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Plus } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/app/chip";
import { ScrollCurrent } from "@/components/app/scroll-current";
import { MicroLabel } from "@/components/app/micro-label";
import { Page } from "@/components/app/page";
import { formatNumber } from "@/lib/format";
import { getPipeline, type LeadCard, type StageGroup } from "@/lib/leads/pipeline-view";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const chipIcon = { destructive: AlertCircle, warning: Clock, success: CheckCircle2 } as const;

/** How many cards a column shows; the count in the header always tells the full number. */
const perColumn = 30;

function Card({ card }: { card: LeadCard }) {
  return (
    <li>
      <Link
        href={`/leads/${card.id}`}
        className="focus-ring group flex flex-col gap-1.5 rounded-md bg-card p-3 elevation-1"
      >
        <span className="flex items-start justify-between gap-2">
          <span className={cn("min-w-0 text-sm font-medium break-words underline-offset-4 group-hover:underline", card.assignedElsewhere && "font-normal text-muted-foreground")}>
            {card.name}
          </span>
          {card.chip && (
            <Chip tone={card.chip.tone} icon={chipIcon[card.chip.tone]} className="shrink-0">
              {card.chip.label}
            </Chip>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{card.meta}</span>
        {card.assignedElsewhere && <span className="text-xs text-muted-foreground">{card.assignedElsewhere}</span>}
      </Link>
    </li>
  );
}

function Cards({ group }: { group: StageGroup }) {
  const shown = group.cards.slice(0, perColumn);
  const hidden = group.cards.length - shown.length;
  return (
    <>
      <ul className="flex flex-col gap-2">
        {shown.map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </ul>
      {hidden > 0 && <p className="px-1 text-xs text-muted-foreground tabular-nums">+{formatNumber(hidden)}</p>}
    </>
  );
}

/**
 * The pipeline: every lead in its stage, in the order the PRD describes
 * (New lead, Contacted, Booked meeting, Booked test training, Consultation
 * done, Price info, then Won and Cold). A board from tablet width up, stage
 * tabs on a phone (the chosen stage is in the address).
 */
export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ steg?: string }> }) {
  const user = await requirePermission("leads", "read");
  const { steg } = await searchParams;
  const { groups } = await getPipeline(db, user.studioId, user.id);
  const chosen = groups.find((g) => g.key === steg) ?? groups.find((g) => g.cards.length > 0 && g.kind === "open") ?? groups[0];

  return (
    <Page
      title={t("leads.title")}
      actions={
        <ButtonLink href="/leads/ny" className="hidden md:inline-flex">
          <Plus aria-hidden="true" />
          {t("leads.new")}
        </ButtonLink>
      }
    >
      {/* Phone: one stage at a time */}
      <div className="flex flex-col gap-4 md:hidden">
        <ScrollCurrent aria-label={t("leads.title")} className="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
          <ul className="flex w-max gap-1 rounded-md bg-well p-1">
            {groups.map((g) => (
              <li key={g.key}>
                <Link
                  href={`/leads?steg=${g.key}`}
                  aria-current={chosen?.key === g.key ? "page" : undefined}
                  className={cn(
                    "focus-ring inline-flex min-h-11 items-center gap-2 rounded-sm px-3 text-sm whitespace-nowrap transition-[background-color]",
                    chosen?.key === g.key ? "bg-card font-medium elevation-1" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {g.name}
                  <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(g.cards.length)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </ScrollCurrent>
        {chosen && <Cards group={chosen} />}
      </div>

      {/* Tablet and desktop: the board */}
      <div className="hidden overflow-x-auto pb-2 md:block">
        <ol className="flex w-max gap-3">
          {groups.map((group) => (
            <li key={group.key} className="w-64 shrink-0">
              <section aria-labelledby={`stage-${group.key}`} className="flex flex-col gap-2 rounded-lg border border-well-border bg-well p-2">
                <h2 id={`stage-${group.key}`} className="flex items-center justify-between gap-2 px-1 pt-1">
                  <MicroLabel>{group.name}</MicroLabel>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(group.cards.length)}</span>
                </h2>
                <Cards group={group} />
              </section>
            </li>
          ))}
        </ol>
      </div>
    </Page>
  );
}
