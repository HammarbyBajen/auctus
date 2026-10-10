import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Plus, Snowflake } from "lucide-react";
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
        <span className={cn("text-sm font-medium break-words underline-offset-4 group-hover:underline", card.assignedElsewhere && "font-normal text-muted-foreground")}>
          {card.name}
        </span>
        <span className="text-xs text-muted-foreground">{card.meta}</span>
        {card.assignedElsewhere && <span className="text-xs text-muted-foreground">{card.assignedElsewhere}</span>}
        {card.chip && (
          <Chip tone={card.chip.tone} icon={chipIcon[card.chip.tone]} className="self-start">
            {card.chip.label}
          </Chip>
        )}
      </Link>
    </li>
  );
}

function Cards({ group, className }: { group: StageGroup; className?: string }) {
  const shown = group.cards.slice(0, perColumn);
  const hidden = group.cards.length - shown.length;
  return (
    <>
      <ul className={cn("flex flex-col gap-2", className)}>
        {shown.map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </ul>
      {hidden > 0 && <p className="px-1 text-xs text-muted-foreground tabular-nums">+{formatNumber(hidden)}</p>}
    </>
  );
}

/**
 * The pipeline: the open stages side by side in the order the PRD describes
 * (New lead, Contacted, Booked meeting, Booked test training, Consultation
 * done, Price info), fitted to the screen so nothing scrolls sideways. Members
 * are left out, and cold leads only show when asked for (?steg=cold). A phone
 * shows one stage at a time behind tabs.
 */
export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ steg?: string }> }) {
  const user = await requirePermission("leads", "read");
  const { steg } = await searchParams;
  const { groups } = await getPipeline(db, user.studioId, user.id);
  const open = groups.filter((g) => g.kind === "open");
  const cold = groups.find((g) => g.kind === "cold");
  const showCold = cold !== undefined && steg === cold.key;
  const chosen = open.find((g) => g.key === steg) ?? open.find((g) => g.cards.length > 0) ?? open[0];

  return (
    <Page
      title={t("leads.title")}
      actions={
        <>
          {cold && (
            <ButtonLink
              href={showCold ? "/leads" : `/leads?steg=${cold.key}`}
              variant={showCold ? "secondary" : "ghost"}
              aria-pressed={showCold}
            >
              <Snowflake aria-hidden="true" />
              {cold.name}
              <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(cold.cards.length)}</span>
            </ButtonLink>
          )}
          <ButtonLink href="/leads/ny" className="hidden md:inline-flex">
            <Plus aria-hidden="true" />
            {t("leads.new")}
          </ButtonLink>
        </>
      }
    >
      {showCold ? (
        <Cards group={cold} className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
      ) : (
        <>
          {/* Phone: one stage at a time */}
          <div className="flex flex-col gap-4 md:hidden">
            <ScrollCurrent current={chosen?.key} aria-label={t("leads.title")} className="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
              <ul className="flex w-max gap-1 rounded-md bg-well p-1">
                {open.map((g) => (
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

          {/* Tablet and desktop: the board, four stages a row until there is room for all */}
          <ol
            style={{ "--stages": open.length } as React.CSSProperties}
            className="hidden gap-3 md:grid md:max-[1599px]:grid-cols-4 min-[1600px]:grid-cols-[repeat(var(--stages),minmax(0,1fr))]"
          >
            {open.map((group) => (
              <li key={group.key} className="min-w-0">
                <section aria-labelledby={`stage-${group.key}`} className="flex h-full flex-col gap-2 rounded-lg border border-well-border bg-well p-2">
                  <h2 id={`stage-${group.key}`} className="flex items-start justify-between gap-2 px-1 pt-1">
                    <MicroLabel className="min-w-0">{group.name}</MicroLabel>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(group.cards.length)}</span>
                  </h2>
                  <Cards group={group} />
                </section>
              </li>
            ))}
          </ol>
        </>
      )}
    </Page>
  );
}
