import Link from "next/link";
import { db } from "@/db";
import { formatDay } from "@/lib/format";
import { formatSpan, type AttentionItem, type Reason } from "@/lib/home/attention";
import { getHomeData } from "@/lib/home/service";
import { listStages } from "@/lib/pipeline/service";
import { isGreyedOut } from "@/lib/tasks/dates";
import { requireUser } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";

const severityStyle = {
  red: "border-red-300 bg-red-50",
  amber: "border-amber-300 bg-amber-50",
  normal: "border-stone-200 bg-white",
} as const;

function span(ms: number) {
  const { unit, value } = formatSpan(ms);
  return t(unit === "minutes" ? "span.minutes" : unit === "hours" ? "span.hours" : "span.days", {
    n: String(value),
  });
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ fel?: string; visa?: string }>;
}) {
  const user = await requireUser();
  const { fel, visa } = await searchParams;
  const scope = visa === "mina" ? "mine" : "all";
  const [{ items, counts }, stages] = await Promise.all([
    getHomeData(db, user.studioId, user.id, scope),
    listStages(db, user.studioId),
  ]);
  const stageName = (key: string) => stages.find((s) => s.key === key)?.name ?? key;

  const tab = (active: boolean) =>
    `rounded-lg px-4 py-2 text-lg ${active ? "bg-stone-900 text-white" : "border border-stone-300 bg-white"}`;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("home.greeting", { name: user.name })}</h1>
      {fel === "behorighet" && (
        <p role="alert" className="rounded-lg bg-amber-100 px-4 py-3">
          {t("home.noAccess")}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-3 text-center">
        <Stat value={counts.newThisWeek} label={t("home.statsNew")} />
        <Stat value={counts.bookedTests} label={t("home.statsTests")} />
        <Stat value={counts.wonThisMonth} label={t("home.statsWon")} />
      </dl>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t("home.attention")}</h2>
          <nav aria-label={t("home.attention")} className="flex gap-2">
            <Link href="/?visa=alla" aria-current={scope === "all" ? "page" : undefined} className={tab(scope === "all")}>
              {t("home.scopeAll")}
            </Link>
            <Link href="/?visa=mina" aria-current={scope === "mine" ? "page" : undefined} className={tab(scope === "mine")}>
              {t("home.scopeMine")}
            </Link>
          </nav>
        </div>
        {items.length === 0 ? (
          <p className="text-lg text-stone-700">{t("home.nothing")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <Card key={item.lead.id} item={item} viewerId={user.id} stageName={stageName} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-2 py-3">
      <dd className="text-3xl font-semibold">{value}</dd>
      <dt className="text-sm text-stone-600">{label}</dt>
    </div>
  );
}

function Card({
  item,
  viewerId,
  stageName,
}: {
  item: AttentionItem;
  viewerId: string;
  stageName: (key: string) => string;
}) {
  const { lead, reasons, severity } = item;
  const greyed = isGreyedOut(lead.assignedToId, viewerId);
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border px-4 py-3 ${severityStyle[severity]} ${
        greyed ? "opacity-60" : ""
      }`}
    >
      <Link href={`/leads/${lead.id}`} className="text-lg font-semibold underline">
        {lead.personName}
      </Link>
      <p className="text-stone-600">
        {stageName(lead.stage)}
        {lead.assigneeName ? ` · ${t("assign.assignedTo", { name: lead.assigneeName })}` : ""}
      </p>
      <ul className="flex flex-col gap-1">
        {reasons.map((reason, index) => (
          <li
            key={index}
            className={
              reason.type === "first_contact_overdue" || reason.type === "task_overdue"
                ? "font-semibold text-red-700"
                : reason.type === "first_contact_soon" || reason.type === "task_today"
                  ? "font-semibold text-amber-800"
                  : "text-stone-700"
            }
          >
            {reasonText(reason)}
          </li>
        ))}
      </ul>
      {lead.phone && (
        <a
          href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
          className="self-start rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg font-medium"
        >
          {t("home.call")} {lead.phone}
        </a>
      )}
    </li>
  );
}
