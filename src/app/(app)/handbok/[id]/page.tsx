import { notFound } from "next/navigation";
import { ArrowLeft, History, Pencil } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { formatDateTime } from "@/lib/format";
import { canEditHandbook, getPage } from "@/lib/handbook/service";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";
import { DocumentView } from "../document-view";

/** One routine, to read (ticket 37). Editors can change it and see its history. */
export default async function HandbookEntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aterstalld?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { aterstalld } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [found, editor] = await Promise.all([getPage(db, user.studioId, id), canEditHandbook(db, user)]);
  if (!found) notFound();
  const { page, category, updatedByName } = found;

  return (
    <Page
      title={page.title}
      description={
        <>
          {category} · {updatedByName ? t("handbook.changedBy", { when: formatDateTime(page.updatedAt), name: updatedByName }) : t("handbook.changed", { when: formatDateTime(page.updatedAt) })}
        </>
      }
      className="max-w-3xl"
      actions={
        <>
          <ButtonLink href="/handbok" variant="ghost" size="sm">
            <ArrowLeft aria-hidden="true" />
            {t("handbook.title")}
          </ButtonLink>
          {editor && (
            <>
              <ButtonLink href={`/handbok/${page.id}/historik`} variant="ghost" size="sm">
                <History aria-hidden="true" />
                {t("handbook.history")}
              </ButtonLink>
              <ButtonLink href={`/handbok/${page.id}/redigera`} variant="outline" size="sm">
                <Pencil aria-hidden="true" />
                {t("handbook.edit")}
              </ButtonLink>
            </>
          )}
        </>
      }
    >
      {aterstalld === "1" && <Notice tone="success">{t("handbook.restored")}</Notice>}
      <article className="rounded-lg bg-card px-4 py-5 elevation-1 sm:px-6">
        <DocumentView content={page.content} />
      </article>
    </Page>
  );
}
