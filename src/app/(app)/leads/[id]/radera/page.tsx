import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, Trash2 } from "lucide-react";
import { db } from "@/db";
import { lead } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/app/notice";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatNumber } from "@/lib/format";
import { deletionPreview } from "@/lib/privacy/service";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";
import { deletePersonAction } from "./actions";

/**
 * Confirming a permanent deletion (ticket 17): what goes, what stays in Mana,
 * and a box that must be ticked. Owners only. A page of its own rather than a
 * press-twice button, so it holds even before the page's script has loaded.
 */
export default async function DeletePersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fran?: string; fel?: string }>;
}) {
  const user = await requirePermission("settings", "manage");
  const { id } = await params;
  const { fran, fel } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [found] = await db.select({ personId: lead.personId }).from(lead).where(and(eq(lead.studioId, user.studioId), eq(lead.id, id))).limit(1);
  if (!found) notFound();
  const preview = await deletionPreview(db, user.studioId, found.personId);
  if (!preview) notFound();
  const back = fran === "integritet" ? "/installningar/integritet" : `/leads/${id}`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <ButtonLink href={back} variant="ghost" size="sm" className="-ml-2 self-start">
        <ArrowLeft aria-hidden="true" />
        {t("privacy.back")}
      </ButtonLink>
      <h1 className="text-xl font-semibold tracking-tight break-words">{t("privacy.deleteTitle", { name: preview.person.name })}</h1>
      {fel === "bekrafta" && <Notice tone="danger">{t("privacy.confirmError")}</Notice>}
      <Panel title={t("privacy.whatGoes")} id="what">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t("privacy.goesPerson")}</li>
          <li>{t("privacy.goesLeads", { n: formatNumber(preview.leads), notes: formatNumber(preview.notes), tasks: formatNumber(preview.tasks) })}</li>
          <li>{t("privacy.goesAlerts")}</li>
        </ul>
        <p className="text-sm text-muted-foreground">{t("privacy.stays")}</p>
      </Panel>
      <form action={deletePersonAction.bind(null, id)} className="flex flex-col gap-4">
        <input type="hidden" name="from" value={fran === "integritet" ? "integritet" : ""} />
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" name="confirm" value="ja" required className="focus-ring mt-0.5 size-5 shrink-0 accent-destructive" />
          {t("privacy.confirm")}
        </label>
        <SubmitButton variant="destructive" className="self-start">
          <Trash2 aria-hidden="true" />
          {t("privacy.deleteSubmit")}
        </SubmitButton>
      </form>
    </div>
  );
}
