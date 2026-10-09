import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { formatDateTime } from "@/lib/format";
import { getLead } from "@/lib/leads/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { NoteForm } from "./note-form";

const link = "inline-block rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg font-medium";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dubblett?: string }>;
}) {
  const user = await requirePermission("leads", "read");
  const { id } = await params;
  const { dubblett } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await getLead(db, user.studioId, id);
  if (!found) notFound();
  const { lead, person, notes } = found;

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
        <dd>{t(`stage.${lead.stage}` as MessageKey)}</dd>
        <dt className="text-stone-600">{t("lead.source")}</dt>
        <dd>{t(`source.${lead.source}` as MessageKey)}</dd>
      </dl>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t("lead.notes")}</h2>
        <NoteForm leadId={lead.id} />
        {notes.length === 0 ? (
          <p className="text-stone-600">{t("lead.noNotes")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                <p className="whitespace-pre-wrap text-lg">{note.body}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {note.authorName ? `${note.authorName} · ` : ""}
                  {formatDateTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
