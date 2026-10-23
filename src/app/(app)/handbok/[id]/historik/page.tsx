import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/app/chip";
import { Page } from "@/components/app/page";
import { SubmitButton } from "@/components/app/submit-button";
import { Surface } from "@/components/app/surface";
import { formatDateTime } from "@/lib/format";
import { canEditHandbook, getPage, getVersion, listVersions } from "@/lib/handbook/service";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { restore } from "../../actions";
import { DocumentView } from "../../document-view";

/** A routine's history (ticket 37): every saved version, who and when; any one can be read, and brought back. */
export default async function HandbookHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const user = await requireUser();
  if (!(await canEditHandbook(db, user))) redirect("/handbok?fel=behorighet");
  const { id } = await params;
  const { version } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [found, versions] = await Promise.all([getPage(db, user.studioId, id), listVersions(db, user.studioId, id)]);
  if (!found) notFound();
  const chosenId = versions.some((v) => v.id === version) ? version! : versions[0]?.id;
  const chosen = chosenId ? await getVersion(db, user.studioId, id, chosenId) : null;
  const isCurrent = chosenId === versions[0]?.id;

  return (
    <Page
      title={t("handbook.historyTitle", { title: found.page.title })}
      className="max-w-5xl"
      actions={
        <ButtonLink href={`/handbok/${id}`} variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("handbook.back")}
        </ButtonLink>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Surface as="nav" aria-label={t("handbook.versions")} className="h-fit overflow-hidden">
          <ul className="divide-y divide-border">
            {versions.map((v, i) => (
              <li key={v.id}>
                <Link
                  href={`/handbok/${id}/historik?version=${v.id}`}
                  aria-current={v.id === chosenId ? "page" : undefined}
                  className={cn("focus-ring flex flex-col gap-0.5 px-4 py-3 text-sm hover:bg-accent", v.id === chosenId && "bg-accent")}
                >
                  <span className="flex flex-wrap items-center gap-2 font-medium tabular-nums">
                    {formatDateTime(v.createdAt)}
                    {i === 0 && <Chip tone="neutral">{t("handbook.current")}</Chip>}
                  </span>
                  <span className="text-xs text-muted-foreground">{v.byName ?? t("handbook.unknownAuthor")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
        {chosen && (
          <div className="flex min-w-0 flex-col gap-4">
            {!isCurrent && (
              <form action={restore.bind(null, id, chosen.id)} className="flex flex-wrap items-center gap-3 rounded-md bg-well p-3">
                <p className="text-sm text-muted-foreground">{t("handbook.restoreIntro")}</p>
                <SubmitButton variant="outline" size="sm">
                  {t("handbook.restoreSubmit")}
                </SubmitButton>
              </form>
            )}
            <article className="rounded-lg bg-card px-4 py-5 elevation-1 sm:px-6">
              <h2 className="mb-4 text-xl font-semibold tracking-tight">{chosen.title}</h2>
              <DocumentView content={chosen.content} />
            </article>
          </div>
        )}
      </div>
    </Page>
  );
}
