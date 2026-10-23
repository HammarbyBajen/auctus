import { notFound } from "next/navigation";
import { ArchiveRestore, ArrowLeft, History, Pencil } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { formatDateTime, formatDay } from "@/lib/format";
import { todayInStockholm } from "@/lib/tasks/dates";
import { SubmitButton } from "@/components/app/submit-button";
import { unarchive } from "../actions";
import { canEditHandbook, getPage, listCategories, listPages } from "@/lib/handbook/service";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";
import { DocumentView } from "../document-view";
import { HandbookNav } from "../handbook-nav";

/** One routine, to read (ticket 37). Editors can change it and see its history. */
export default async function HandbookEntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aterstalld?: string; arkiverad?: string; tillbaka?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { aterstalld, arkiverad, tillbaka } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [found, editor, categories, pages] = await Promise.all([
    getPage(db, user.studioId, id),
    canEditHandbook(db, user),
    listCategories(db, user.studioId),
    listPages(db, user.studioId),
  ]);
  // An archived routine is out of use: only those who write see it.
  if (!found || (found.page.archivedAt && !editor)) notFound();
  const { page, category, updatedByName, archivedByName } = found;

  return (
    <Page
      title={page.title}
      description={
        <>
          {category} · {updatedByName ? t("handbook.changedBy", { when: formatDateTime(page.updatedAt), name: updatedByName }) : t("handbook.changed", { when: formatDateTime(page.updatedAt) })}
        </>
      }
      className="max-w-6xl"
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
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {aterstalld === "1" && <Notice tone="success">{t("handbook.restored")}</Notice>}
          {tillbaka === "1" && <Notice tone="success">{t("handbook.unarchivedDone")}</Notice>}
          {page.archivedAt && (
            <Notice tone="warning">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {arkiverad === "1" ? `${t("handbook.archivedDone")} ` : ""}
                  {archivedByName
                    ? t("handbook.archivedBy", { date: formatDay(todayInStockholm(page.archivedAt)), name: archivedByName })
                    : t("handbook.archivedAt", { date: formatDay(todayInStockholm(page.archivedAt)) })}
                </span>
                <form action={unarchive.bind(null, page.id)}>
                  <SubmitButton size="sm" variant="outline" keepLabel>
                    <ArchiveRestore aria-hidden="true" />
                    {t("handbook.unarchive")}
                  </SubmitButton>
                </form>
              </span>
            </Notice>
          )}
          {/* A comfortable line length for reading, whatever the screen. */}
          <article className="max-w-3xl rounded-lg bg-card px-4 py-5 elevation-1 sm:px-6">
            <DocumentView content={page.content} />
          </article>
        </div>
        <HandbookNav categories={categories} pages={pages} currentPageId={page.id} />
      </div>
    </Page>
  );
}
