import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { formatDateTime } from "@/lib/format";
import { getLead, type HistoryItem } from "@/lib/leads/service";
import { contactOutcomes } from "@/lib/pipeline/defaults";
import { listColdReasons, listStages } from "@/lib/pipeline/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { logContactAction, moveStage } from "../actions";
import { NoteForm } from "./note-form";

const link = "inline-block rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg font-medium";
const button = "rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dubblett?: string; fel?: string }>;
}) {
  const user = await requirePermission("leads", "read");
  const { id } = await params;
  const { dubblett, fel } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await getLead(db, user.studioId, id);
  if (!found) notFound();
  const { lead, person, stage, history } = found;
  const [stages, reasons] = await Promise.all([
    listStages(db, user.studioId),
    listColdReasons(db, user.studioId),
  ]);
  const stageName = (key: string | null) => stages.find((s) => s.key === key)?.name ?? key ?? "";
  const reasonName = (key: string | null) => reasons.find((r) => r.key === key)?.name ?? key ?? "";
  const coldStages = stages.filter((s) => s.kind === "cold");
  const move = moveStage.bind(null, lead.id);
  const log = logContactAction.bind(null, lead.id);

  return (
    <main className="flex flex-col gap-6">
      <Link href="/leads" className="underline">
        {t("leads.back")}
      </Link>
      <h1 className="text-2xl font-semibold">{person.name}</h1>
      {dubblett === "1" && (
        <p role="status" className="rounded-lg bg-amber-100 px-4 py-3">
          {t("leadForm.duplicate")}
        </p>
      )}
      {fel === "anledning" && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3">
          {t("lead.errorReason")}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {person.phone ? (
          <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className={link}>
            {t("lead.call")} {person.phone}
          </a>
        ) : null}
        {person.email ? (
          <a href={`mailto:${person.email}`} className={link}>
            {t("lead.mail")}
          </a>
        ) : null}
        {!person.phone && !person.email && <span className="text-stone-600">{t("lead.noContact")}</span>}
      </div>
      {person.email && <p className="text-stone-700">{person.email}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-lg">
        <dt className="text-stone-600">{t("lead.stage")}</dt>
        <dd className="font-semibold">
          {stage.name}
          {lead.coldReason && (
            <span className="block font-normal text-stone-600">
              {t("lead.coldWhy", { reason: reasonName(lead.coldReason) })}
            </span>
          )}
        </dd>
        <dt className="text-stone-600">{t("lead.source")}</dt>
        <dd>{t(`source.${lead.source}` as MessageKey)}</dd>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("lead.contactTitle")}</h2>
        <form action={log} className="flex flex-wrap gap-3">
          {contactOutcomes.map((outcome) => (
            <button key={outcome} name="outcome" value={outcome} className={button}>
              {t(`outcome.${outcome}` as MessageKey)}
            </button>
          ))}
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("lead.moveTo")}</h2>
        <div className="flex flex-wrap gap-3">
          {stages
            .filter((s) => s.kind !== "cold" && s.key !== lead.stage)
            .map((s) => (
              <form key={s.key} action={move}>
                <input type="hidden" name="stage" value={s.key} />
                <button className={button}>{s.name}</button>
              </form>
            ))}
        </div>
        {coldStages
          .filter((s) => s.key !== lead.stage)
          .map((s) => (
            <details key={s.key} className="rounded-lg border border-stone-300 bg-white px-4 py-3">
              <summary className="cursor-pointer text-lg">{s.name}</summary>
              <form action={move} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="stage" value={s.key} />
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-lg">{t("lead.coldReasonLabel")}</legend>
                  {reasons.map((r) => (
                    <label key={r.key} className="flex items-center gap-3 text-lg">
                      <input type="radio" name="coldReason" value={r.key} required />
                      {r.name}
                    </label>
                  ))}
                </fieldset>
                <button className="self-start rounded-lg bg-stone-900 px-4 py-3 text-lg font-medium text-white">
                  {t("lead.coldSubmit")}
                </button>
              </form>
            </details>
          ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t("lead.notes")}</h2>
        <NoteForm leadId={lead.id} />
        {history.length === 0 ? (
          <p className="text-stone-600">{t("lead.noNotes")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                <HistoryLine item={item} stageName={stageName} reasonName={reasonName} />
                <p className="mt-1 text-sm text-stone-500">
                  {item.authorName ? `${item.authorName} · ` : ""}
                  {formatDateTime(item.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function HistoryLine({
  item,
  stageName,
  reasonName,
}: {
  item: HistoryItem;
  stageName: (key: string | null) => string;
  reasonName: (key: string | null) => string;
}) {
  if (item.kind === "note") return <p className="whitespace-pre-wrap text-lg">{item.body}</p>;
  if (item.kind === "contact_logged") {
    return (
      <p className="text-lg">
        {t("history.contact", { outcome: t(`outcome.${item.outcome}` as MessageKey) })}
      </p>
    );
  }
  return (
    <div>
      <p className="text-lg">
        {item.fromStage
          ? t("history.stageChanged", { from: stageName(item.fromStage), to: stageName(item.toStage) })
          : t("history.stageStart", { to: stageName(item.toStage) })}
      </p>
      {item.coldReason && (
        <p className="text-stone-600">{t("history.coldBecause", { reason: reasonName(item.coldReason) })}</p>
      )}
    </div>
  );
}
