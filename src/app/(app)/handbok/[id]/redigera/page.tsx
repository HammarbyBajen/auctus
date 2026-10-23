import { notFound, redirect } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Page } from "@/components/app/page";
import { cleanDocument } from "@/lib/handbook/document";
import { canEditHandbook, getPage, listCategories } from "@/lib/handbook/service";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";
import { archive, removePage, unarchive } from "../../actions";
import { SubmitButton } from "@/components/app/submit-button";
import { PageForm } from "../../page-form";
import { RemoveRoutine } from "./remove-routine";

/** Changing a routine (ticket 37); every save is kept in its history. */
export default async function EditHandbookPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!(await canEditHandbook(db, user))) redirect("/handbok?fel=behorighet");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [found, categories] = await Promise.all([getPage(db, user.studioId, id), listCategories(db, user.studioId)]);
  if (!found) notFound();
  const { page } = found;

  return (
    <Page
      title={t("handbook.editTitle", { title: page.title })}
      className="max-w-3xl"
      actions={
        <ButtonLink href={`/handbok/${page.id}`} variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("handbook.back")}
        </ButtonLink>
      }
    >
      <PageForm
        id={page.id}
        title={page.title}
        categoryId={page.categoryId}
        content={cleanDocument(page.content)}
        categories={categories.map(({ id, name }) => ({ id, name }))}
        basedOn={page.updatedAt.toISOString()}
      />
      <div className="flex flex-wrap items-start gap-3">
        {page.archivedAt ? (
          <form action={unarchive.bind(null, page.id)}>
            <SubmitButton variant="outline" keepLabel>
              <ArchiveRestore aria-hidden="true" />
              {t("handbook.unarchive")}
            </SubmitButton>
          </form>
        ) : (
          <form action={archive.bind(null, page.id)}>
            <SubmitButton variant="outline" keepLabel>
              <Archive aria-hidden="true" />
              {t("handbook.archive")}
            </SubmitButton>
          </form>
        )}
        <RemoveRoutine action={removePage.bind(null, page.id)} />
      </div>
    </Page>
  );
}
