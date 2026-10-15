import { db } from "@/db";
import { MicroLabel } from "@/components/app/micro-label";
import { Page } from "@/components/app/page";
import { Panel, Surface } from "@/components/app/surface";
import { formatMonth, formatNumber, formatPercent } from "@/lib/format";
import { getLeadReport } from "@/lib/reports/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const sourceName = (source: string) => t(`source.${source}` as MessageKey) ?? source;
const hours = (h: number | null) => (h === null ? "–" : t("report.hours", { n: formatNumber(h) }));

/**
 * The lead report (ticket 16): leads per source and month, how many became
 * members, and how fast someone got in touch. For everyone who works leads.
 */
export default async function ReportPage() {
  const user = await requirePermission("leads", "read");
  const { report, firstContactHours } = await getLeadReport(db, user.studioId);
  const { months, sources, conversion, contact } = report;
  const total = months.reduce((n, m) => n + m.total, 0);
  const newestFirst = [...months].reverse();

  const figures: { label: string; value: string; note: string }[] = [
    { label: t("report.leads"), value: formatNumber(total), note: t("report.leadsNote", { n: String(months.length) }) },
    {
      label: t("report.conversion"),
      value: conversion.leads ? formatPercent(conversion.won / conversion.leads) : "–",
      note: t("report.conversionNote", { won: formatNumber(conversion.won), leads: formatNumber(conversion.leads) }),
    },
    {
      label: t("report.firstContact"),
      value: hours(contact.medianHours),
      note:
        contact.contacted === 0
          ? t("report.firstContactNone")
          : t("report.firstContactNote", { average: hours(contact.averageHours), share: formatPercent(contact.withinLimit ?? 0), limit: String(firstContactHours) }),
    },
  ];

  return (
    <Page title={t("report.title")} description={t("report.intro")} className="max-w-5xl">
      <dl className="grid gap-4 sm:grid-cols-3">
        {figures.map((f) => (
          <Surface key={f.label} as="div" className="flex flex-col gap-1 p-4 sm:p-5">
            <MicroLabel as="dt">{f.label}</MicroLabel>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">{f.value}</dd>
            <dd className="text-xs text-muted-foreground">{f.note}</dd>
          </Surface>
        ))}
      </dl>

      <Panel title={t("report.perMonth")} id="per-manad">
        <p className="text-sm text-muted-foreground">{t("report.perMonthHint")}</p>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full text-sm">
            <thead className="bg-well text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="sticky left-0 bg-well px-4 py-2 text-left font-medium sm:px-5">
                  {t("report.month")}
                </th>
                {sources.map((s) => (
                  <th key={s} scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {sourceName(s)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-medium text-foreground">
                  {t("report.total")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium whitespace-nowrap sm:px-5">
                  {t("report.wonOfOwn")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {newestFirst.map((m) => (
                <tr key={m.month}>
                  <th scope="row" className="sticky left-0 bg-card px-4 py-2 text-left font-normal whitespace-nowrap capitalize sm:px-5">
                    {formatMonth(m.month)}
                  </th>
                  {sources.map((s) => (
                    <td key={s} className="px-3 py-2 text-right tabular-nums">
                      {m.bySource[s] ? formatNumber(m.bySource[s]) : <span className="text-muted-foreground">0</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(m.total)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground sm:px-5">
                    {m.own ? t("report.wonCell", { won: formatNumber(m.won), own: formatNumber(m.own) }) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
