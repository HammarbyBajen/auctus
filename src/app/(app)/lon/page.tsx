import Link from "next/link";
import { Clock, Download, ListChecks, Lock, RefreshCw, Users } from "lucide-react";
import { db } from "@/db";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/app/chip";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { NativeSelect } from "@/components/app/native-select";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel, Surface } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateTime, formatHours, formatMonth, formatNumber } from "@/lib/format";
import { monthOptions, previousMonth } from "@/lib/salary/calc";
import { getMonth, isMonth, listInstructors, listPeople, monthLog, testMonths } from "@/lib/salary/service";
import { requirePermission } from "@/lib/session";
import { todayInStockholm } from "@/lib/tasks/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { lockMonthAction, pullMonthAction, unlockMonthAction } from "./actions";

export const dynamic = "force-dynamic";
// Pulling a month asks Mana a dozen or so questions, one a second.
export const maxDuration = 300;

const errors = ["locked", "not_pulled", "stale", "mana-auth", "mana-not_configured", "mana-rate_limited", "mana-network", "mana-api", "mana-contract"];

const statusLabel: Record<string, MessageKey> = {
  booked: "salary.status.booked",
  canceled: "salary.status.canceled",
  refunded: "salary.status.refunded",
  no_show: "salary.status.no_show",
};

/**
 * Salary (tickets 20-23): a month's coach hours from Mana, per person and kind
 * of work, with free classes taken off. Names and hours only. Owners only.
 */
export default async function SalaryPage({ searchParams }: { searchParams: Promise<{ manad?: string; fel?: string; hamtat?: string; last?: string; upplast?: string }> }) {
  const user = await requirePermission("salary", "read");
  const params = await searchParams;
  const today = todayInStockholm();
  const month = isMonth(params.manad) ? params.manad : previousMonth(today);
  const options = monthOptions(today);
  if (!options.includes(month)) options.unshift(month);

  const [state, people, log, instructors] = await Promise.all([
    getMonth(db, user.studioId, month),
    listPeople(db, user.studioId),
    monthLog(db, user.studioId, month),
    listInstructors(db, user.studioId),
  ]);
  const result = state.result;
  const error = errors.find((e) => e === params.fel);
  const stale = state.stale;
  const unset = result?.types.filter((ty) => ty.paid === null) ?? [];
  const notCounted = Object.entries(result?.notCounted ?? {});
  const instructorName = new Map(instructors.map((i) => [i.id, i.name]));
  // Work by an instructor nobody is linked to, per instructor; work with no instructor at all, one by one.
  const noInstructor = result?.unassigned.filter((u) => !u.instructorId) ?? [];
  const groups = new Map<string, { instructorId: string; sessions: number; minutes: number }>();
  for (const u of result?.unassigned ?? []) {
    if (!u.instructorId) continue;
    const g = groups.get(u.instructorId) ?? { instructorId: u.instructorId, sessions: 0, minutes: 0 };
    g.sessions += 1;
    g.minutes += u.minutes;
    groups.set(u.instructorId, g);
  }
  const notLinked = [...groups.values()].sort((a, b) => b.minutes - a.minutes);
  const total = (pick: (p: NonNullable<typeof result>["people"][number]) => number) => Math.round((result?.people.reduce((n, p) => n + pick(p), 0) ?? 0) * 100) / 100;

  return (
    <Page
      title={t("salary.title")}
      description={t("salary.intro")}
      className="max-w-6xl"
      actions={
        <>
          <ButtonLink href="/lon/personer" variant="outline" size="sm">
            <Users aria-hidden="true" />
            {t("salary.people")}
          </ButtonLink>
          <ButtonLink href="/lon/regler" variant="outline" size="sm">
            <ListChecks aria-hidden="true" />
            {t("salary.rules")}
          </ButtonLink>
        </>
      }
    >
      {params.hamtat === "1" && <Notice tone="success">{t("salary.pulled")}</Notice>}
      {params.last === "1" && <Notice tone="success">{t("salary.lockedNow")}</Notice>}
      {params.upplast === "1" && <Notice tone="success">{t("salary.unlockedNow")}</Notice>}
      {error && <Notice tone="danger">{t(`salary.error.${error}` as MessageKey)}</Notice>}
      {testMonths.has(month) && <Notice tone="warning">{t("salary.testMonth")}</Notice>}

      <Surface as="div" className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-5">
        <form action="/lon" className="flex items-end gap-2">
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
          </p>
          <div className="flex flex-wrap gap-2">
            {state.lockedAt ? (
              <form action={unlockMonthAction.bind(null, month)}>
                <ConfirmButton variant="outline" confirmLabel={t("salary.unlockConfirm")}>
                  {t("salary.unlock")}
                </ConfirmButton>
              </form>
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
                    <ConfirmButton variant="outline" confirmLabel={stale ? t("salary.refreshAndLockConfirm") : t("salary.lockConfirm")}>
                      <Lock aria-hidden="true" />
                      {stale ? t("salary.refreshAndLock") : t("salary.lock")}
                    </ConfirmButton>
                  </form>
                )}
              </>
            )}
            {result && (
              <>
                <ButtonAnchor href={`/lon/export?manad=${month}&format=xlsx`} variant="outline" download>
                  <Download aria-hidden="true" />
                  {t("salary.exportXlsx")}
                </ButtonAnchor>
                <ButtonAnchor href={`/lon/export?manad=${month}&format=csv`} variant="ghost" download>
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
          {(unset.length > 0 || noInstructor.length > 0 || people.length === 0) && (
            <div className="flex flex-col gap-2">
              {people.length === 0 && (
                <Notice tone="warning">
                  {t("salary.noPeople")}{" "}
                  <Link href="/lon/personer" className="focus-ring rounded-xs font-medium underline underline-offset-4">
                    {t("salary.people")}
                  </Link>
                </Notice>
              )}
              {unset.length > 0 && (
                <Notice tone="warning">
                  {t("salary.unsetTypes", { names: unset.map((ty) => ty.label).join(", ") })}{" "}
                  <Link href="/lon/regler" className="focus-ring rounded-xs font-medium underline underline-offset-4">
                    {t("salary.rules")}
                  </Link>
                </Notice>
              )}
              {noInstructor.length > 0 && <Notice tone="warning">{t("salary.noInstructorNotice", { n: formatNumber(noInstructor.length) })}</Notice>}
            </div>
          )}

          <Surface className="overflow-hidden" aria-labelledby="timmar">
            <h2 id="timmar" className="sr-only">
              {t("salary.hoursTitle")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-well text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="sticky left-0 bg-well px-4 py-2 font-medium">
                      {t("salary.col.name")}
                    </th>
                    {result.types.map((ty) => (
                      <th key={ty.typeKey} scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {ty.label}
                          {ty.paid === false && <span className="font-normal">{t("salary.unpaidMark")}</span>}
                          {ty.paid === null && (
                            <Chip tone="warning" className="ml-1">
                              {t("salary.unsetChip")}
                            </Chip>
                          )}
                        </span>
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {t("salary.col.freeClasses")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {t("salary.col.freeHours")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium whitespace-nowrap text-foreground">
                      {t("salary.col.toPay")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.people.map((p) => (
                    <tr key={p.personId}>
                      <th scope="row" className="sticky left-0 bg-card px-4 py-2 text-left font-medium whitespace-nowrap">
                        {p.name}
                      </th>
                      {result.types.map((ty) => (
                        <td key={ty.typeKey} className="px-3 py-2 text-right tabular-nums">
                          {p.byType[ty.typeKey] ? formatHours(p.byType[ty.typeKey]) : <span className="text-muted-foreground">0</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(p.freeClasses)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatHours(p.freeHours)}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatHours(p.toPay)}</td>
                    </tr>
                  ))}
                </tbody>
                {result.people.length > 1 && (
                  <tfoot className="bg-well">
                    <tr>
                      <th scope="row" className="sticky left-0 bg-well px-4 py-2 text-left font-medium">
                        {t("salary.total")}
                      </th>
                      {result.types.map((ty) => (
                        <td key={ty.typeKey} className="px-3 py-2 text-right tabular-nums">
                          {formatHours(total((p) => p.byType[ty.typeKey] ?? 0))}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(total((p) => p.freeClasses))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatHours(total((p) => p.freeHours))}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatHours(total((p) => p.toPay))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Surface>

          <div className="grid gap-6 lg:grid-cols-2">
            {notLinked.length > 0 && (
              <Panel title={t("salary.notLinkedTitle")} id="ej-kopplade">
                <p className="text-sm text-muted-foreground">
                  {t("salary.notLinkedHint")}{" "}
                  <Link href="/lon/personer" className="focus-ring rounded-xs font-medium underline underline-offset-4">
                    {t("salary.people")}
                  </Link>
                </p>
                <ul className="flex flex-col divide-y divide-border text-sm">
                  {notLinked.map((g) => (
                    <li key={g.instructorId} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span className="font-medium">{instructorName.get(g.instructorId) ?? t("salary.person.unknownInstructor")}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{t("salary.sessionsAndHours", { n: formatNumber(g.sessions), h: formatHours(g.minutes / 60) })}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {noInstructor.length > 0 && (
              <Panel title={t("salary.noInstructorTitle")} id="utan-instruktor">
                <p className="text-sm text-muted-foreground">{t("salary.noInstructorHint")}</p>
                <ul className="flex flex-col divide-y divide-border text-sm">
                  {noInstructor.map((u) => (
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
                      <span>{t(l.action === "lock" ? "salary.log.lock" : "salary.log.unlock", { who: l.by ?? t("salary.someone") })}</span>
                      <span className="text-muted-foreground">{formatDateTime(l.at)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
