import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Page } from "@/components/app/page";
import { emptyDoc } from "@/lib/handbook/document";
import { canEditHandbook, listCategories } from "@/lib/handbook/service";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";
import { PageForm } from "../page-form";

/** A new routine (ticket 37). `?kategori=` picks the category to start in. */
export default async function NewHandbookPage({ searchParams }: { searchParams: Promise<{ kategori?: string }> }) {
  const user = await requireUser();
  if (!(await canEditHandbook(db, user))) redirect("/handbok?fel=behorighet");
  const { kategori } = await searchParams;
  const categories = await listCategories(db, user.studioId);
  if (categories.length === 0) redirect("/handbok");
  return (
    <Page
      title={t("handbook.new")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/handbok" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("handbook.title")}
        </ButtonLink>
      }
    >
      <PageForm
        id={null}
        title=""
        categoryId={categories.some((c) => c.id === kategori) ? kategori! : categories.length === 1 ? categories[0].id : ""}
        content={emptyDoc()}
        categories={categories.map(({ id, name }) => ({ id, name }))}
      />
    </Page>
  );
}
