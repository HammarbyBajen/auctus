import { AlertCircle, ArrowRight, CircleCheck, Clock, Mail, Phone, Plus, RotateCcw, TimerReset } from "lucide-react";
import { db } from "@/db";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/app/chip";
import { EmptyState } from "@/components/app/empty-state";
import { MicroLabel } from "@/components/app/micro-label";
import { Stagger, StaggerItem } from "@/components/app/stagger";
import { Surface } from "@/components/app/surface";
import { formatDay } from "@/lib/format";
import { formatSpan, type Reason } from "@/lib/home/attention";
import { getHomeData } from "@/lib/home/service";
import { getLead } from "@/lib/leads/service";
import { rowChip } from "@/lib/leads/row";
import { requirePermission } from "@/lib/session";
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

/**
 * The detail side before a lead is chosen (large screens only; on a phone the
 * list fills the screen). Rather than an empty pane, it shows the lead that
 * needs action first, ready to call.
 */
export default async function LeadsIndex() {
  const user = await requirePermission("leads", "read");
  const { items } = await getHomeData(db, user.studioId, user.id, "all");
  const top = items[0];
  const found = top ? await getLead(db, user.studioId, top.lead.id) : null;
  const following = items.slice(1, 4);

  if (!top || !found) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <EmptyState
          icon={CircleCheck}
          title={t("home.nothing")}
          action={
            <ButtonLink href="/leads/ny" variant="outline">
              <Plus aria-hidden="true" />
              {t("leads.new")}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const chip = rowChip({ reasons: top.reasons, stageKind: found.stage.kind });
  const { person } = found;
  return (
    <Stagger className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <StaggerItem>
        <MicroLabel as="h3">{t("leads.nextUp")}</MicroLabel>
      </StaggerItem>
      <StaggerItem>
        <Surface as="article" className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{person.name}</h2>
              {chip && (
                <Chip tone={chip.tone} icon={chip.tone === "destructive" ? AlertCircle : chip.tone === "warning" ? Clock : CircleCheck}>
                  {t(`chip.${chip.key}` as MessageKey)}
                </Chip>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {found.stage.name} · {t(`source.${found.lead.source}` as MessageKey) || t("source.unknown")}
            </p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {top.reasons.map((reason, index) => {
              const Icon =
                reason.type === "first_contact_overdue" || reason.type === "task_overdue"
                  ? AlertCircle
                  : reason.type === "first_contact_soon" || reason.type === "task_today"
                    ? Clock
                    : reason.type === "win_back"
                      ? RotateCcw
                      : TimerReset;
              return (
                <li key={index} className="flex items-start gap-2">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {reasonText(reason)}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {person.phone && (
              <ButtonAnchor href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} size="lg">
                <Phone aria-hidden="true" />
                {t("lead.call")} <span className="tabular-nums">{person.phone}</span>
              </ButtonAnchor>
            )}
            {person.email && (
              <ButtonAnchor href={`mailto:${person.email}`} size="lg" variant="outline">
                <Mail aria-hidden="true" />
                {t("lead.mail")}
              </ButtonAnchor>
            )}
            <ButtonLink href={`/leads/${found.lead.id}`} size="lg" variant="ghost">
              {t("leads.open")}
              <ArrowRight aria-hidden="true" />
            </ButtonLink>
          </div>
        </Surface>
      </StaggerItem>
      {following.map((item) => {
        const next = rowChip({ reasons: item.reasons, stageKind: "open" });
        return (
          <StaggerItem key={item.lead.id}>
            <Surface as="article" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight">{item.lead.personName}</h2>
                  {next && (
                    <Chip tone={next.tone} icon={next.tone === "destructive" ? AlertCircle : Clock}>
                      {t(`chip.${next.key}` as MessageKey)}
                    </Chip>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{reasonText(item.reasons[0])}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {item.lead.phone && (
                  <ButtonAnchor
                    href={`tel:${item.lead.phone.replace(/[^\d+]/g, "")}`}
                    variant="outline"
                    aria-label={`${t("home.call")} ${item.lead.personName}`}
                  >
                    <Phone aria-hidden="true" />
                    {t("home.call")}
                  </ButtonAnchor>
                )}
                <ButtonLink href={`/leads/${item.lead.id}`} variant="ghost" size="icon" aria-label={`${t("leads.open")}: ${item.lead.personName}`}>
                  <ArrowRight aria-hidden="true" />
                </ButtonLink>
              </div>
            </Surface>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
