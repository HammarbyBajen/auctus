import Link from "next/link";
import type { AtRiskEmails } from "@/db/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/app/chip";
import { MicroLabel } from "@/components/app/micro-label";
import { SubmitButton } from "@/components/app/submit-button";
import { Surface } from "@/components/app/surface";
import { formatDay, formatNumber } from "@/lib/format";
import { daysAgo } from "@/lib/leads/activity";
import { contactOutcomes, dismissReasons, type AtRiskNoteRow, type AtRiskRow } from "@/lib/mana/at-risk-service";
import { atRiskDraft, type AtRiskGroup } from "@/lib/mana/at-risk-work";
import type { EmailMode } from "@/lib/email/mode";
import { sendMemberEmail } from "./email-actions";
import { todayInStockholm } from "@/lib/tasks/dates";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";
import { AssigneeSelect } from "./leads/[id]/assignee-select";
import { assignAtRisk, dismissAtRisk, distributeAtRisk, logAtRiskContact } from "./at-risk-actions";
import { AtRiskPanels } from "./at-risk-panels";

/** How many rows show before "Visa alla". */
const firstRows = 10;

export type AtRiskFilter = "all" | AtRiskGroup;

/** The members page (ticket 36) with a scope, a group and all rows or the first ten, as the address says it. */
export function membersHref({ scope, filter, all }: { scope: "all" | "mine"; filter: AtRiskFilter; all: boolean }) {
  const params = new URLSearchParams();
  if (scope === "mine") params.set("visa", "mina");
  if (filter !== "all") params.set("grupp", filter === "never" ? "aldrig" : "borta");
  if (all) params.set("alla", "1");
  const query = params.toString();
  return `/medlemmar${query ? `?${query}` : ""}`;
}

const noteLabel = (n: AtRiskNoteRow) => t(`atRisk.kind.${n.kind}` as MessageKey);

function NoteLine({ note }: { note: AtRiskNoteRow }) {
  return (
    <>
      <span className="font-medium text-foreground">{noteLabel(note)}</span> {formatDay(todayInStockholm(note.at))}
      {note.by ? ` · ${note.by}` : ""}
      {note.body ? `: ${note.body}` : ""}
    </>
  );
}

/**
 * Hör av dig till (ticket 13): paying members who have been away, on the
 * members page (ticket 36), so members stay out of the sales pipeline. Staff
 * can split the list, share it out, and keep notes on every call.
 */
export function AtRiskList({
  rows,
  days,
  filter,
  showAll,
  scope,
  viewerId,
  people,
  emails,
  emailMode,
}: {
  rows: AtRiskRow[];
  days: number;
  filter: AtRiskFilter;
  showAll: boolean;
  scope: "all" | "mine";
  viewerId: string;
  people: { id: string; name: string }[];
  emails: AtRiskEmails;
  emailMode: EmailMode;
}) {
  const today = todayInStockholm();
  // "Mina": mine and nobody's, as with leads.
  const inScope = scope === "mine" ? rows.filter((r) => !r.assignedToId || r.assignedToId === viewerId) : rows;
  const count = (group: AtRiskGroup) => inScope.filter((r) => r.group === group).length;
  const shown = filter === "all" ? inScope : inScope.filter((r) => r.group === filter);
  const visible = showAll ? shown : shown.slice(0, firstRows);
  const unassigned = rows.filter((r) => !r.assignedToId).length;

  const href = (next: { filter?: AtRiskFilter; all?: boolean }) =>
    `${membersHref({ scope, filter: next.filter ?? filter, all: next.all ?? false })}#hor-av-dig`;
  const tabs: { key: AtRiskFilter; label: string; n: number }[] = [
    { key: "all", label: t("atRisk.filter.all"), n: inScope.length },
    { key: "never", label: t("atRisk.filter.never"), n: count("never") },
    { key: "away", label: t("atRisk.filter.away"), n: count("away") },
  ];

  return (
    <div id="hor-av-dig" className="flex min-w-0 scroll-mt-20 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <MicroLabel as="h3">
          <span id="at-risk">{t("atRisk.title")}</span>
        </MicroLabel>
        <p className="text-xs text-muted-foreground">{t("atRisk.intro", { days: String(days) })}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label={t("atRisk.filter.label")} className="inline-flex flex-wrap rounded-md bg-well p-1">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={href({ filter: tab.key })}
              aria-current={filter === tab.key ? "page" : undefined}
              className={cn(
                "focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-sm px-3 text-sm transition-[background-color]",
                filter === tab.key ? "bg-card font-medium elevation-1" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {tab.label}
              <span className="tabular-nums text-muted-foreground">{formatNumber(tab.n)}</span>
            </Link>
          ))}
        </nav>

        {unassigned > 0 && people.length > 0 && (
          <details className="group relative">
            <summary className="focus-ring inline-flex min-h-9 cursor-pointer list-none items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              {t("atRisk.distribute", { n: formatNumber(unassigned) })}
            </summary>
            <form action={distributeAtRisk} className="mt-2 flex flex-col gap-2 rounded-md bg-well p-3 sm:absolute sm:right-0 sm:z-10 sm:w-72 sm:bg-card sm:elevation-2">
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">{t("atRisk.distributeLabel")}</legend>
                {people.map((p) => (
                  <Label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal hover:bg-accent sm:min-h-9">
                    <Checkbox name="staff" value={p.id} />
                    {p.name}
                  </Label>
                ))}
              </fieldset>
              <p className="text-xs text-muted-foreground">{t("atRisk.distributeHint")}</p>
              <SubmitButton size="sm" className="self-start">
                {t("atRisk.distributeSave")}
              </SubmitButton>
            </form>
          </details>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg bg-well px-4 py-6 text-sm text-muted-foreground">{t("atRisk.filterEmpty")}</p>
      ) : (
        <Surface as="div" className="overflow-hidden" aria-labelledby="at-risk">
          <ul className="divide-y divide-border">
            {visible.map((row) => {
              const name = row.name ?? row.email ?? t("atRisk.noName");
              const last = row.lastVisitAt;
              const [latest] = row.notes;
              return (
                <li key={row.id} className="flex flex-col gap-3 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium break-words">{name}</p>
                        {/* No visit at all in Mana: they may have stopped, or get in some other way and need help with Mana. */}
                        {row.group === "never" && <Chip tone="neutral">{t("atRisk.neverChip")}</Chip>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {last
                          ? t("atRisk.lastVisit", { date: formatDay(todayInStockholm(last)), n: String(daysAgo(last, today)) })
                          : t("atRisk.never", { date: formatDay(todayInStockholm(row.since)) })}
                        {row.memberships.length > 0 ? ` · ${row.memberships.join(", ")}` : ""}
                      </p>
                      {latest && (
                        <p className="text-xs break-words text-muted-foreground">
                          <NoteLine note={latest} />
                          {row.attempts > 0 ? ` · ${t("atRisk.attempts", { n: String(row.attempts) })}` : ""}
                        </p>
                      )}
                    </div>
                    <div className={cn("shrink-0", row.assignedToId && row.assignedToId !== viewerId && "opacity-80")}>
                      <AssigneeSelect action={assignAtRisk.bind(null, row.id)} value={row.assignedToId ?? ""} people={people} />
                    </div>
                  </div>
                  <AtRiskPanels
                    id={`risk-${row.id}`}
                    name={name}
                    phone={row.phone}
                    email={row.email ? { to: row.email, ...atRiskDraft(row, emails), mode: emailMode, action: sendMemberEmail.bind(null, row.id) } : null}
                    logAction={logAtRiskContact.bind(null, row.id)}
                    dismissAction={dismissAtRisk.bind(null, row.id)}
                    outcomes={contactOutcomes}
                    reasons={dismissReasons}
                    minReturnBy={today}
                    history={
                      row.notes.length > 0 ? (
                        <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
                          {row.notes.map((n, i) => (
                            <li key={i} className="break-words">
                              <NoteLine note={n} />
                            </li>
                          ))}
                        </ul>
                      ) : null
                    }
                  />
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {!showAll && shown.length > firstRows && (
        <Link href={href({ all: true })} className="focus-ring self-start rounded-xs text-sm font-medium underline underline-offset-4">
          {t("atRisk.showAll", { n: formatNumber(shown.length) })}
        </Link>
      )}
    </div>
  );
}
