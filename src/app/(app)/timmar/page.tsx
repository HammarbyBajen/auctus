import { Clock, Download, Lock, RefreshCw, Send } from "lucide-react";
import { db } from "@/db";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { NativeSelect } from "@/components/app/native-select";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel, Surface } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateTime, formatHours, formatKr, formatMonth, formatNumber } from "@/lib/format";
import { monthOptions } from "@/lib/salary/calc";
import { getAccountantEmail, getMonth, isMonth, listCoaches, monthLog, testMonths } from "@/lib/salary/service";
import { requirePermission } from "@/lib/session";
import { todayInStockholm } from "@/lib/tasks/dates";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";
import { lockMonthAction, pullMonthAction, sendToAccountantAction, setAccountantEmailAction, setCountedAction, setRatesAction, unlockMonthAction } from "./actions";
import { CategoryChecks } from "./category-checks";

export const dynamic = "force-dynamic";
// Pulling a month asks Mana a dozen or so questions, one a second.
export const maxDuration = 300;

const errors = ["locked", "not_pulled", "stale", "rate", "accountant", "no_accountant", "not_locked", "send_not_sent", "send_suppressed", "send_failed", "mana-auth", "mana-not_configured", "mana-rate_limited", "mana-network", "mana-api", "mana-contract"];

const sources: { key: string; title: MessageKey }[] = [
  { key: "class", title: "salary.source.classes" },
  { key: "service", title: "salary.source.services" },
  { key: "course", title: "salary.source.courses" },
];

const statusLabel: Record<string, MessageKey> = {
  booked: "salary.status.booked",
  canceled: "salary.status.canceled",
  refunded: "salary.status.refunded",
  no_show: "salary.status.no_show",
};

/**
 * Timmar (tickets 20-23): how many hours each coach held classes and courses
 * in a month, by category, from Mana. Every category counts until an owner
 * leaves it out. Names and hours only. Owners only.
 */
export default async function HoursPage({ searchParams }: { searchParams: Promise<{ manad?: string; fel?: string; hamtat?: string; last?: string; upplast?: string; urval?: string; timlon?: string; revisor?: string; skickat?: string }> }) {
  const user = await requirePermission("salary", "read");
  const params = await searchParams;
  const today = todayInStockholm();
  // This month unless the address says otherwise (Max, 2026-10-27): the hours so far, and the month to lock once it ends.
  const month = isMonth(params.manad) ? params.manad : today.slice(0, 7);
  const options = monthOptions(today);
  if (!options.includes(month)) options.unshift(month);

  const [state, log, coaches, accountant] = await Promise.all([getMonth(db, user.studioId, month), monthLog(db, user.studioId, month), listCoaches(db, user.studioId), getAccountantEmail(db, user.studioId)]);
  // The latest send to the accountant, if any: shown by the button so two owners do not both send.
  const sent = log.find((l) => l.action === "sent");
  const result = state.result;
  const locked = Boolean(state.lockedAt);
  // A coach who worked this month with no rate set: their amount is unknown, and the month's total with it.
  const withoutRate = result?.coaches.filter((c) => c.hourlyRateOre === null) ?? [];
  const error = errors.find((e) => e === params.fel);
  const notCounted = Object.entries(result?.notCounted ?? {});
  const unassigned = result?.unassigned ?? [];
  const sum = (values: number[]) => Math.round(values.reduce((n, v) => n + v, 0) * 100) / 100;
  const typeOf = new Map(result?.types.map((ty) => [ty.typeKey, ty]) ?? []);
  // Hours per category across every coach, grouped as Mana groups them.
  const categories = sources
    .map((source) => {
      const types = (result?.types ?? [])
        .filter((ty) => ty.source === source.key)
        .map((ty) => ({ ...ty, hours: sum(result!.coaches.map((c) => c.byType[ty.typeKey] ?? 0)) }))
        .sort((a, b) => b.hours - a.hours);
      return { ...source, types };
    })
    .filter((c) => c.types.length > 0);
  const leftOut = result?.types.filter((ty) => !ty.counted) ?? [];

  return (
    <Page title={t("salary.title")} description={t("salary.intro")} className="max-w-5xl">
      {params.hamtat === "1" && <Notice tone="success">{t("salary.pulled")}</Notice>}
      {params.urval === "1" && <Notice tone="success">{t("salary.countedSaved")}</Notice>}
      {params.last === "1" && <Notice tone="success">{t("salary.lockedNow")}</Notice>}
      {params.upplast === "1" && <Notice tone="success">{t("salary.unlockedNow")}</Notice>}
      {error && <Notice tone="danger">{t(`salary.error.${error}` as MessageKey)}</Notice>}
      {testMonths.has(month) && <Notice tone="warning">{t("salary.testMonth")}</Notice>}

      <Surface as="div" className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-5">
        <form action="/timmar" className="flex items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="manad">{t("salary.month")}</Label>
            <NativeSelect id="manad" name="manad" defaultValue={month} className="w-48 capitalize">
              {options.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline">
            {t("salary.show")}
          </Button>
        </form>

        <div className="flex flex-col gap-2 sm:items-end">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {state.lockedAt
              ? t("salary.lockedBy", { when: formatDateTime(state.lockedAt), who: state.lockedBy ?? t("salary.someone") })
              : state.pulledAt
                ? t("salary.pulledAt", { when: formatDateTime(state.pulledAt) })
                : t("salary.notPulled")}
            {sent && ` ${t("salary.sentBy", { when: formatDateTime(sent.at), who: sent.by ?? t("salary.someone") })}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {locked ? (
              <>
                <form action={sendToAccountantAction.bind(null, month)}>
                  <ConfirmButton variant={sent ? "outline" : "default"} confirmLabel={t("salary.sendConfirm")} disabled={!accountant}>
                    <Send aria-hidden="true" />
                    {sent ? t("salary.sendAgain") : t("salary.send")}
                  </ConfirmButton>
                </form>
                <form action={unlockMonthAction.bind(null, month)}>
                  <ConfirmButton variant="outline" confirmLabel={t("salary.unlockConfirm")}>
                    {t("salary.unlock")}
                  </ConfirmButton>
                </form>
              </>
            ) : (
              <>
                <form action={pullMonthAction.bind(null, month)}>
                  <SubmitButton variant={state.pulledAt ? "outline" : "default"} pendingLabel={t("salary.pulling")}>
                    <RefreshCw aria-hidden="true" />
                    {state.pulledAt ? t("salary.refresh") : t("salary.pull")}
                  </SubmitButton>
                </form>
                {state.pulledAt && (
                  <form action={lockMonthAction.bind(null, month)}>
                    <ConfirmButton variant="outline" confirmLabel={state.stale ? t("salary.refreshAndLockConfirm") : t("salary.lockConfirm")}>
                      <Lock aria-hidden="true" />
                      {state.stale ? t("salary.refreshAndLock") : t("salary.lock")}
                    </ConfirmButton>
                  </form>
                )}
              </>
            )}
            {result && (
              <>
                <ButtonAnchor href={`/timmar/export?manad=${month}&format=xlsx`} variant="outline" download>
                  <Download aria-hidden="true" />
                  {t("salary.exportXlsx")}
                </ButtonAnchor>
                <ButtonAnchor href={`/timmar/export?manad=${month}&format=csv`} variant="ghost" download>
                  {t("salary.exportCsv")}
                </ButtonAnchor>
              </>
            )}
          </div>
        </div>
      </Surface>

      {!result ? (
        <EmptyState icon={Clock} title={t("salary.emptyTitle")} description={t("salary.emptyText")} />
      ) : (
        <>
          {unassigned.length > 0 && <Notice tone="warning">{t("salary.noInstructorNotice", { n: formatNumber(unassigned.length) })}</Notice>}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Surface className="overflow-hidden" aria-labelledby="per-coach">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
                <h2 id="per-coach" className="text-base font-semibold tracking-tight">
                  {t("salary.perCoach")}
                </h2>
                {leftOut.length > 0 && <p className="text-xs text-muted-foreground">{t("salary.leftOutNote", { names: leftOut.map((ty) => ty.label).join(", ") })}</p>}
              </div>
              <table className="mt-3 w-full text-sm">
                <thead className="bg-well text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                      {t("salary.col.coach")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium whitespace-nowrap text-foreground sm:px-5">
                      {t("salary.col.total")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium whitespace-nowrap text-foreground sm:px-5">
                      {t("salary.col.amount")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.coaches.map((c) => {
                    const parts = Object.entries(c.byType).sort((a, b) => b[1] - a[1]);
                    return (
                      <tr key={c.coachId} className="align-top">
                        <th scope="row" className="px-4 py-3 text-left font-normal sm:px-5">
                          <span className="font-medium">{c.name}</span>
                          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground" aria-label={t("salary.categoriesOf", { name: c.name })}>
                            {parts.map(([key, hours]) => {
                              const ty = typeOf.get(key);
                              const out = ty?.counted === false;
                              return (
                                <li key={key} className={cn("whitespace-nowrap", out && "line-through decoration-muted-foreground/60")}>
                                  {ty?.label ?? key} <span className={cn("tabular-nums", !out && "text-foreground")}>{formatHours(hours)} h</span>
                                  {out && <span className="sr-only"> {t("salary.notCountedMark")}</span>}
                                </li>
                              );
                            })}
                          </ul>
                        </th>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums sm:px-5">{formatHours(c.total)}</td>
                        <td className="px-4 py-3 text-right tabular-nums sm:px-5">
                          {c.amountOre === null ? (
                            <span className="text-xs text-muted-foreground">{t("salary.noRate")}</span>
                          ) : (
                            <>
                              <span className="font-semibold">{formatKr(c.amountOre)}</span>
                              <span className="block text-xs text-muted-foreground">{formatKr(c.hourlyRateOre!)}/h</span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {result.coaches.length > 1 && (
                  <tfoot className="bg-well">
                    <tr>
                      <th scope="row" className="px-4 py-2 text-left font-medium sm:px-5">
                        {t("salary.total")}
                      </th>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums sm:px-5">{formatHours(sum(result.coaches.map((c) => c.total)))}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums sm:px-5">
                        {withoutRate.length > 0 ? <span className="text-xs font-normal text-muted-foreground">{t("salary.totalUnknown")}</span> : formatKr(result.coaches.reduce((n, c) => n + (c.amountOre ?? 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </Surface>

            <div className="flex flex-col gap-6">
            <Panel title={t("salary.ratesTitle")} id="timlon">
              <p className="text-sm text-muted-foreground">{t("salary.ratesHint")}</p>
              {params.timlon === "1" && <Notice tone="success">{t("salary.ratesSaved")}</Notice>}
              {withoutRate.length > 0 && <Notice tone="warning">{t("salary.ratesMissing", { names: withoutRate.map((c) => c.name).join(", ") })}</Notice>}
              {coaches.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("salary.ratesEmpty")}</p>
              ) : (
                <form action={setRatesAction.bind(null, month)} className="flex flex-col gap-3">
                  {coaches.map((c) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <Label htmlFor={`rate-${c.id}`} className="min-w-0 flex-1 truncate font-normal">
                        {c.name}
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <Input id={`rate-${c.id}`} name={`rate:${c.id}`} type="number" inputMode="decimal" min={0} max={10000} step={1} defaultValue={c.hourlyRateOre === null ? "" : String(c.hourlyRateOre / 100)} className="w-24 text-right tabular-nums" />
                        <span className="text-sm text-muted-foreground">kr/h</span>
                      </div>
                    </div>
                  ))}
                  <SubmitButton variant="outline" className="self-start">
                    {t("salary.ratesSave")}
                  </SubmitButton>
                </form>
              )}
            </Panel>

            <Panel title={t("salary.accountantTitle")} id="revisor">
              <p className="text-sm text-muted-foreground">{t("salary.accountantHint")}</p>
              {params.revisor === "1" && <Notice tone="success">{t("salary.accountantSaved")}</Notice>}
              {params.skickat === "1" && <Notice tone="success">{t("salary.sentNow")}</Notice>}
              <form action={setAccountantEmailAction.bind(null, month)} className="flex flex-col gap-2">
                <Label htmlFor="accountant-email">{t("salary.accountantEmail")}</Label>
                <div className="flex gap-2">
                  <Input id="accountant-email" name="email" type="email" defaultValue={accountant ?? ""} placeholder="namn@byra.se" className="min-w-0 flex-1" />
                  <SubmitButton variant="outline">{t("salary.accountantSave")}</SubmitButton>
                </div>
              </form>
            </Panel>

            <Panel title={t("salary.categories")} id="kategorier">
              <p className="text-sm text-muted-foreground">{locked ? t("salary.categoriesLocked") : t("salary.categoriesHint")}</p>
              <form action={setCountedAction.bind(null, month)} className="flex flex-col gap-4">
                {/* Starts again from what is saved after a save or a change of month. */}
                <CategoryChecks
                  key={`${month}:${categories.flatMap((c) => c.types.filter((ty) => ty.counted).map((ty) => ty.typeKey)).join(",")}`}
                  groups={categories.map((c) => ({ key: c.key, title: t(c.title), types: c.types.map(({ typeKey, label, hours, counted }) => ({ typeKey, label, hours, counted })) }))}
                  locked={locked}
                />
                {!locked && (
                  <SubmitButton variant="outline" className="self-start">
                    {t("salary.saveCounted")}
                  </SubmitButton>
                )}
              </form>
            </Panel>
            </div>
          </div>

          {(unassigned.length > 0 || notCounted.length > 0 || log.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {unassigned.length > 0 && (
                <Panel title={t("salary.noInstructorTitle")} id="utan-instruktor">
                  <p className="text-sm text-muted-foreground">{t("salary.noInstructorHint")}</p>
                  <ul className="flex flex-col divide-y divide-border text-sm">
                    {unassigned.map((u) => (
                      <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                        <span className="font-medium">{u.typeLabel}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(new Date(u.startsAt))} · {formatHours(u.minutes / 60)} h
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {notCounted.length > 0 && (
                <Panel title={t("salary.notCountedTitle")} id="raknas-inte">
                  <p className="text-sm text-muted-foreground">{t("salary.notCountedHint")}</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {notCounted.map(([status, n]) => (
                      <li key={status} className="flex justify-between gap-2">
                        <span>{statusLabel[status] ? t(statusLabel[status]) : status}</span>
                        <span className="tabular-nums">{formatNumber(n)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {log.length > 0 && (
                <Panel title={t("salary.logTitle")} id="logg">
                  <ul className="flex flex-col gap-1 text-sm">
                    {log.map((l, i) => (
                      <li key={i} className="flex flex-wrap justify-between gap-2">
                        <span>{t(l.action === "lock" ? "salary.log.lock" : l.action === "sent" ? "salary.log.sent" : "salary.log.unlock", { who: l.by ?? t("salary.someone") })}</span>
                        <span className="text-muted-foreground">{formatDateTime(l.at)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
