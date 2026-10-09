import Link from "next/link";
import { AlertCircle, Clock, Phone, RotateCcw, TimerReset } from "lucide-react";
import { db } from "@/db";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/app/notice";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { StageBadge } from "@/components/app/stage-badge";
import { Stat } from "@/components/app/stat";
import { formatDay } from "@/lib/format";
import { formatSpan, type AttentionItem, type Reason } from "@/lib/home/attention";
import { getHomeData } from "@/lib/home/service";
import { listStages } from "@/lib/pipeline/service";
import { isGreyedOut } from "@/lib/tasks/dates";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";

const stripe = {
  red: "border-l-destructive",
  amber: "border-l-[#d99a1e]",
  normal: "border-l-border",
} as const;

function span(ms: number) {
  const { unit, value } = formatSpan(ms);
  return t(unit === "minutes" ? "span.minutes" : unit === "hours" ? "span.hours" : "span.days", { n: String(value) });
}

function reasonText(reason: Reason): string {
  switch (reason.type) {
    case "first_contact_overdue":
      return t("reason.firstContactOverdue", { span: span(reason.msOver) });
    case "first_contact_soon":
      return t("reason.firstContactSoon", { span: span(reason.msLeft) });
    case "first_contact_ok":
      return t("reason.firstContactOk", { span: span(reason.msLeft) });
    case "task_overdue":
      return t("reason.taskOverdue", { title: reason.title, date: formatDay(reason.dueDate) });
    case "task_today":
      return t("reason.taskToday", { title: reason.title });
    case "stalled":
      return t("reason.stalled", { days: String(reason.days) });
    case "win_back":
      return `${t(`source.${reason.source}` as MessageKey)} · ${t("reason.winBack")}`;
  }
}

function ReasonLine({ reason }: { reason: Reason }) {
  const urgent = reason.type === "first_contact_overdue" || reason.type === "task_overdue";
  const soon = reason.type === "first_contact_soon" || reason.type === "task_today";
  const Icon = urgent ? AlertCircle : soon ? Clock : reason.type === "win_back" ? RotateCcw : TimerReset;
  return (
    <li
      className={cn(
        "flex items-start gap-2",
        urgent && "font-medium text-danger-text",
        soon && "font-medium text-warning-text",
        !urgent && !soon && "text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">{reasonText(reason)}</span>
    </li>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ fel?: string; visa?: string }> }) {
  const user = await requireUser();
  const { fel, visa } = await searchParams;
  const scope = visa === "mina" ? "mine" : "all";
  const [{ items, counts }, stages] = await Promise.all([
    getHomeData(db, user.studioId, user.id, scope),
    listStages(db, user.studioId),
  ]);
  const stageOf = (key: string) => stages.find((s) => s.key === key);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("home.greeting", { name: user.name })} />
      {fel === "behorighet" && <Notice tone="warning">{t("home.noAccess")}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:order-2 lg:grid-cols-1 lg:content-start">
          <Stat value={counts.newThisWeek} label={t("home.statsNew")} shortLabel={t("home.statsNewShort")} />
          <Stat value={counts.bookedTests} label={t("home.statsTests")} shortLabel={t("home.statsTestsShort")} />
          <Stat value={counts.wonThisMonth} label={t("home.statsWon")} shortLabel={t("home.statsWonShort")} />
        </dl>

        <section aria-labelledby="attention" className="flex min-w-0 flex-col gap-4 lg:order-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>
              <span id="attention">{t("home.attention")}</span>
            </SectionTitle>
            <nav aria-label={t("home.attention")} className="inline-flex rounded-md border border-border bg-card p-1">
              {(["all", "mine"] as const).map((value) => (
                <Link
                  key={value}
                  href={value === "all" ? "/?visa=alla" : "/?visa=mina"}
                  aria-current={scope === value ? "page" : undefined}
                  className={cn(
                    "label-caps inline-flex min-h-10 items-center rounded-sm px-4 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring",
                    scope === value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
                  )}
                >
                  {value === "all" ? t("home.scopeAll") : t("home.scopeMine")}
                </Link>
              ))}
            </nav>
          </div>

          {items.length === 0 ? (
            <Notice tone="success">{t("home.nothing")}</Notice>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <AttentionCard key={item.lead.id} item={item} viewerId={user.id} stage={stageOf(item.lead.stage)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function AttentionCard({
  item,
  viewerId,
  stage,
}: {
  item: AttentionItem;
  viewerId: string;
  stage?: { name: string; kind: string };
}) {
  const { lead, reasons, severity } = item;
  const greyed = isGreyedOut(lead.assignedToId, viewerId);
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-md border border-l-4 border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
        stripe[severity],
        greyed && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/leads/${lead.id}`}
            className="min-w-0 text-lg font-medium break-words underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {lead.personName}
          </Link>
          {stage && <StageBadge name={stage.name} kind={stage.kind} />}
        </div>
        {lead.assigneeName && (
          <p className="text-sm text-muted-foreground">{t("assign.assignedTo", { name: lead.assigneeName })}</p>
        )}
        <ul className="flex flex-col gap-1">
          {reasons.map((reason, index) => (
            <ReasonLine key={index} reason={reason} />
          ))}
        </ul>
      </div>
      {lead.phone && (
        <Button asChild variant="outline" className="shrink-0 sm:self-center">
          <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} aria-label={`${t("home.call")} ${lead.personName}`}>
            <Phone aria-hidden="true" />
            {t("home.call")}
          </a>
        </Button>
      )}
    </li>
  );
}
