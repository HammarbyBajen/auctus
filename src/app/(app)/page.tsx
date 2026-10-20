import Link from "next/link";
import { AlertCircle, CircleCheck, Clock, Phone, RotateCcw, TimerReset } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { ButtonAnchor } from "@/components/ui/button";
import { Chip } from "@/components/app/chip";
import { EmptyState } from "@/components/app/empty-state";
import { MicroLabel } from "@/components/app/micro-label";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Stagger, StaggerItem } from "@/components/app/stagger";
import { Surface } from "@/components/app/surface";
import { formatDay, formatNumber } from "@/lib/format";
import { formatSpan, type AttentionItem, type Reason } from "@/lib/home/attention";
import { getHomeData } from "@/lib/home/service";
import { getKpi } from "@/lib/kpi/service";
import { getAtRiskEmails, listAtRisk } from "@/lib/mana/at-risk-service";
import { listUsers } from "@/lib/users/service";
import { can } from "@/lib/permissions";
import { todayInStockholm } from "@/lib/tasks/dates";
import { rowChip } from "@/lib/leads/row";
import { listStages } from "@/lib/pipeline/service";
import { isGreyedOut } from "@/lib/tasks/dates";
import { AtRiskList } from "./at-risk-list";
import { getEmailSettings } from "@/lib/email/service";
import { MemberTrend } from "./member-trend";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";

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

const reasonIcon = (r: Reason) =>
  r.type === "first_contact_overdue" || r.type === "task_overdue"
    ? AlertCircle
    : r.type === "first_contact_soon" || r.type === "task_today"
      ? Clock
      : r.type === "win_back"
        ? RotateCcw
        : TimerReset;

/**
 * Home. Owners are greeted by the gym's key numbers (ticket 26): paying members
 * with a twelve-month trend, and monthly revenue. GAP (docs/DESIGN.md 3.1):
 * staff need a hero of their own (D2); until then theirs is the list of leads
 * that need action.
 */
/** How many leads without a next step Home shows before "Visa alla" (ticket 29). */
const laterRows = 5;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ fel?: string; visa?: string; risk?: string; riskalla?: string; fler?: string }> }) {
  const user = await requireUser();
  const { fel, visa, risk, riskalla, fler } = await searchParams;
  const scope = visa === "mina" ? "mine" : "all";
  const showKpi = can(user.role, "kpi", "read");
  const [{ items, counts }, stages, kpi, atRisk, [settings], people, emails, emailSettings] = await Promise.all([
    getHomeData(db, user.studioId, user.id, scope),
    listStages(db, user.studioId),
    showKpi ? getKpi(db, user.studioId, todayInStockholm()) : null,
    listAtRisk(db, user.studioId),
    db.select({ atRiskDays: studioSettings.atRiskDays }).from(studioSettings).where(eq(studioSettings.studioId, user.studioId)).limit(1),
    listUsers(db, user.studioId),
    getAtRiskEmails(db, user.studioId),
    getEmailSettings(db, user.studioId),
  ]);
  const stageOf = (key: string) => stages.find((s) => s.key === key);
  // Deadlines first; leads without a next step below, quieter and capped (ticket 29).
  const now = items.filter((i) => i.group === "now");
  const later = items.filter((i) => i.group === "later");
  const showAllLater = fler === "1";
  const laterShown = showAllLater ? later : later.slice(0, laterRows);
  const laterHref = (all: boolean) => {
    const params = new URLSearchParams();
    if (scope === "mine") params.set("visa", "mina");
    // Keep the Hör av dig till list as it was filtered.
    if (risk === "aldrig" || risk === "borta") params.set("risk", risk);
    if (riskalla === "1") params.set("riskalla", "1");
    if (all) params.set("fler", "1");
    const query = params.toString();
    return `/${query ? `?${query}` : ""}#utan-nasta-steg`;
  };
  const row = (item: AttentionItem) => (
    <AttentionRow key={item.lead.id} item={item} viewerId={user.id} stageName={stageOf(item.lead.stage)?.name ?? ""} stageKind={stageOf(item.lead.stage)?.kind ?? "open"} />
  );

  return (
    <Page
      title={t("home.greeting", { name: user.name })}
      actions={
        <nav aria-label={t("home.attention")} className="inline-flex rounded-md bg-well p-1">
          {(["all", "mine"] as const).map((value) => (
            <Link
              key={value}
              href={value === "all" ? "/?visa=alla" : "/?visa=mina"}
              aria-current={scope === value ? "page" : undefined}
              className={cn(
                "focus-ring inline-flex min-h-9 items-center rounded-sm px-3 text-sm transition-[background-color]",
                scope === value ? "bg-card font-medium elevation-1" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {value === "all" ? t("home.scopeAll") : t("home.scopeMine")}
            </Link>
          ))}
        </nav>
      }
    >
      {fel === "behorighet" && <Notice tone="warning">{t("home.noAccess")}</Notice>}
      <Stagger className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        {kpi?.hasData && (
          <>
            <StaggerItem className="min-w-0">
              <MemberTrend trend={kpi.trend} />
            </StaggerItem>
            <StaggerItem>
              <Surface className="flex h-full flex-col gap-2 p-4 sm:p-5" aria-labelledby="kpi-revenue">
                <MicroLabel as="h3">
                  <span id="kpi-revenue">{t("kpi.revenue")}</span>
                </MicroLabel>
                <p className="text-2xl font-semibold tracking-tight">{t("kpi.revenueValue", { amount: formatNumber(Math.round(kpi.revenue)) })}</p>
                <p className="text-xs text-muted-foreground">{t("kpi.revenueHint")}</p>
              </Surface>
            </StaggerItem>
          </>
        )}
        <StaggerItem className="flex min-w-0 flex-col gap-3">
          <MicroLabel as="h3">{t("home.attention")}</MicroLabel>
          {now.length === 0 ? (
            <EmptyState icon={CircleCheck} title={later.length > 0 ? t("home.nothingUrgent") : t("home.nothing")} />
          ) : (
            <Surface as="div" className="overflow-hidden">
              <ul className="divide-y divide-border">{now.map(row)}</ul>
            </Surface>
          )}
          {later.length > 0 && (
            <div id="utan-nasta-steg" className="mt-3 flex scroll-mt-20 flex-col gap-3">
              <div className="flex flex-col gap-1">
                <MicroLabel as="h3">{t("home.later", { n: formatNumber(later.length) })}</MicroLabel>
                <p className="text-xs text-muted-foreground">{t("home.laterIntro")}</p>
              </div>
              <Surface as="div" className="overflow-hidden">
                <ul className="divide-y divide-border">{laterShown.map(row)}</ul>
              </Surface>
              {later.length > laterRows && (
                <Link href={laterHref(!showAllLater)} className="focus-ring self-start rounded-xs text-sm font-medium underline underline-offset-4">
                  {showAllLater ? t("home.laterFewer") : t("home.laterAll", { n: formatNumber(later.length) })}
                </Link>
              )}
            </div>
          )}
        </StaggerItem>

        <StaggerItem className="flex flex-col gap-3">
          {/* Beside the attention list (xl), start level with its card, below its heading. */}
          <div aria-hidden="true" className="invisible max-xl:hidden">
            <MicroLabel as="p">{t("home.attention")}</MicroLabel>
          </div>
          <Surface as="div" className="p-4">
            <dl className="grid grid-cols-3 gap-4 xl:grid-cols-1">
              {(
                [
                  [counts.newThisWeek, "home.statsNew"],
                  [counts.bookedTests, "home.statsTests"],
                  [counts.wonThisMonth, "home.statsWon"],
                ] as const
              ).map(([value, key]) => (
                <div key={key} className="flex flex-col gap-1">
                  <dd className="text-lg font-semibold tracking-tight tabular-nums">{formatNumber(value)}</dd>
                  <dt className="text-xs text-muted-foreground">{t(key)}</dt>
                </div>
              ))}
            </dl>
          </Surface>
        </StaggerItem>

        {atRisk.length > 0 && (
          <StaggerItem className="flex min-w-0 flex-col gap-3">
            <AtRiskList
              rows={atRisk}
              days={settings?.atRiskDays ?? 30}
              filter={risk === "aldrig" ? "never" : risk === "borta" ? "away" : "all"}
              showAll={riskalla === "1"}
              scope={scope}
              laterAll={showAllLater}
              viewerId={user.id}
              people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
              emails={emails}
              emailMode={emailSettings.mode}
            />
          </StaggerItem>
        )}
      </Stagger>
    </Page>
  );
}

function AttentionRow({ item, viewerId, stageName, stageKind }: { item: AttentionItem; viewerId: string; stageName: string; stageKind: string }) {
  const { lead, reasons } = item;
  const elsewhere = isGreyedOut(lead.assignedToId, viewerId);
  const chip = rowChip({ reasons, stageKind });
  const [first, ...rest] = reasons;
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/leads/${lead.id}`}
            className={cn("focus-ring rounded-xs text-sm font-medium underline-offset-4 hover:underline", elsewhere && "font-normal text-muted-foreground")}
          >
            {lead.personName}
          </Link>
          {chip && (
            <Chip tone={chip.tone} icon={chip.tone === "destructive" ? AlertCircle : chip.tone === "warning" ? Clock : CircleCheck}>
              {t(`chip.${chip.key}` as MessageKey)}
            </Chip>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {stageName}
          {lead.assigneeName ? ` · ${t("assign.assignedTo", { name: lead.assigneeName })}` : ""}
        </p>
        <ul className="flex flex-col gap-0.5 text-sm">
          {[first, ...rest].map((reason, index) => {
            const Icon = reasonIcon(reason);
            return (
              <li key={index} className="flex items-start gap-2">
                <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words">{reasonText(reason)}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {lead.phone && (
        <ButtonAnchor href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} variant="outline" className="shrink-0" aria-label={`${t("home.call")} ${lead.personName}`}>
          <Phone aria-hidden="true" />
          {t("home.call")}
        </ButtonAnchor>
      )}
    </li>
  );
}
