import Link from "next/link";
import { AlertCircle, BarChart3, CheckCircle2, Clock, Plus, SearchX, Snowflake } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/app/chip";
import { ScrollCurrent } from "@/components/app/scroll-current";
import { MicroLabel } from "@/components/app/micro-label";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { Surface } from "@/components/app/surface";
import { formatDay, formatNumber } from "@/lib/format";
import { getPipeline, type LeadCard, type StageGroup } from "@/lib/leads/pipeline-view";
import { isFiltering, parseLeadFilters, periods, searchLeads, usedSources } from "@/lib/leads/search";
import { requirePermission } from "@/lib/session";
import { isGreyedOut, todayInStockholm } from "@/lib/tasks/dates";
import { listStudioUsers } from "@/lib/tasks/service";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";
import { SearchForm } from "./search-form";

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

function Cards({ group, className, limit = perColumn }: { group: StageGroup; className?: string; limit?: number }) {
  const shown = group.cards.slice(0, limit);
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
 * shows one stage at a time behind tabs. Searching or filtering (ticket 08)
 * shows a list of matching leads from every stage instead, members and cold
 * leads included, so anyone can be found.
 */
export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("leads", "read");
  const params = await searchParams;
  const steg = typeof params.steg === "string" ? params.steg : undefined;
  const filters = parseLeadFilters(params);
  const filtering = isFiltering(filters);
  const [{ groups }, sources, users, results] = await Promise.all([
    getPipeline(db, user.studioId, user.id),
    usedSources(db, user.studioId),
    listStudioUsers(db, user.studioId),
    filtering ? searchLeads(db, user.studioId, filters, user.id) : null,
  ]);
  const open = groups.filter((g) => g.kind === "open");
  const cold = groups.find((g) => g.kind === "cold");
  const showCold = cold !== undefined && steg === cold.key;
  const chosen = open.find((g) => g.key === steg) ?? open.find((g) => g.cards.length > 0) ?? open[0];

  return (
    <Page
      title={t("leads.title")}
      actions={
        <>
          <ButtonLink href="/rapport" variant="ghost" className="lg:hidden">
            <BarChart3 aria-hidden="true" />
            {t("nav.report")}
          </ButtonLink>
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
          <ButtonLink href="/leads/ny">
            <Plus aria-hidden="true" />
            {t("leads.new")}
          </ButtonLink>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {params.raderad === "1" && <Notice tone="success">{t("privacy.deleted")}</Notice>}
        <SearchForm
          key={JSON.stringify(filters)}
          filters={filters}
          active={filtering}
          stages={groups.map((g) => ({ value: g.key, label: g.name }))}
          sources={sources.map((s) => ({ value: s, label: t(`source.${s}` as MessageKey) || t("source.unknown") }))}
          assignees={[
            { value: "mina", label: t("search.mine") },
            { value: "ingen", label: t("search.nobody") },
            ...users.filter((u) => u.id !== user.id).map((u) => ({ value: u.id, label: u.name })),
          ]}
          periods={Object.keys(periods).map((d) => ({ value: d, label: t(`search.period${d}` as MessageKey) }))}
        />
        {results ? (
          <Results
            rows={results.map((r) => ({
              id: r.lead.id,
              name: r.person.name,
              meta: [
                r.stage.name,
                t(`source.${r.lead.source}` as MessageKey) || t("source.unknown"),
                formatDay(todayInStockholm(r.lead.createdAt)),
              ].join(" · "),
              assignedTo: r.assigneeName ? t("assign.assignedTo", { name: r.assigneeName }) : null,
              elsewhere: isGreyedOut(r.lead.assignedToId, user.id),
            }))}
          />
        ) : showCold ? (
          // The cold view is the only way to reach old leads, so it shows all of them.
          <Cards group={cold} limit={Infinity} className="grid sm:grid-cols-[repeat(auto-fill,12rem)]" />
        ) : (
          <>
            <div className="@container">
              {/* Narrow (a phone, a tablet, or a big zoom): one stage at a time */}
              <div className="flex flex-col gap-4 @min-[50rem]:hidden">
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
                {chosen && <Cards group={chosen} className="max-w-md" />}
              </div>

              {/*
                Wide enough for every stage side by side (a container query on the content
                width, so the sidebar and zoom are accounted for): the board, one row, each
                stage at most 12rem wide so cards never stretch, and never scrolling sideways.
              */}
              <div className="hidden @min-[50rem]:block">
                <ol
                  style={{ "--stages": open.length } as React.CSSProperties}
                  // Two shared rows (headers, then cards) that every stage joins as a subgrid,
                  // so a header that wraps to two lines moves every stage's first card down with it.
                  className="grid grid-cols-[repeat(var(--stages),minmax(0,12rem))] grid-rows-[auto_1fr] gap-x-2 lg:gap-x-3"
                >
                  {open.map((group) => (
                    <li key={group.key} className="row-span-2 grid min-w-0 grid-rows-subgrid">
                      <section aria-labelledby={`stage-${group.key}`} className="row-span-2 grid grid-rows-subgrid gap-y-2 rounded-lg border border-well-border bg-well p-2">
                        <h2 id={`stage-${group.key}`} className="flex items-start justify-between gap-2 px-1 pt-1">
                          <MicroLabel className="min-w-0 hyphens-auto [hyphenate-limit-chars:10_4_4]">{group.name}</MicroLabel>
                          <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(group.cards.length)}</span>
                        </h2>
                        <div className="flex flex-col gap-2">
                          <Cards group={group} />
                        </div>
                      </section>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

type ResultRow = { id: string; name: string; meta: string; assignedTo: string | null; elsewhere: boolean };

/** Leads matching a search or filter, from every stage, newest first. */
function Results({ rows }: { rows: ResultRow[] }) {
  if (rows.length === 0) return <EmptyState icon={SearchX} title={t("search.none")} />;
  return (
    <section aria-labelledby="results" className="flex max-w-3xl flex-col gap-2">
      <MicroLabel as="h3">
        <span id="results" role="status">
          {rows.length === 1 ? t("search.resultsOne") : t("search.results", { n: formatNumber(rows.length) })}
        </span>
      </MicroLabel>
      <Surface as="div" className="overflow-hidden">
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="[contain-intrinsic-size:auto_3.75rem] [content-visibility:auto]">
              <Link href={`/leads/${r.id}`} className="focus-ring group flex flex-col gap-0.5 px-4 py-3 hover:bg-accent">
                <span className={cn("text-sm font-medium underline-offset-4 group-hover:underline", r.elsewhere && "font-normal text-muted-foreground")}>{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  {r.meta}
                  {r.assignedTo ? ` · ${r.assignedTo}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}
