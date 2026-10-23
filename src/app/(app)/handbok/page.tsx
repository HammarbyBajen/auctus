import Form from "next/form";
import Link from "next/link";
import { BookOpen, ChevronRight, Plus, Search, X } from "lucide-react";
import { db } from "@/db";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/empty-state";
import { MicroLabel } from "@/components/app/micro-label";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Surface } from "@/components/app/surface";
import { formatDay, formatNumber } from "@/lib/format";
import { canEditHandbook, listCategories, listPages, type PageListItem } from "@/lib/handbook/service";
import { todayInStockholm } from "@/lib/tasks/dates";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Handbok (ticket 37): every category, opened to see its routines, and the
 * routines changed most recently beside them; a search across all the text.
 * Everyone on the staff reads; owners and the people they choose write.
 */
export default async function HandbookPage({ searchParams }: { searchParams: Promise<{ q?: string; fel?: string; borttagen?: string }> }) {
  const user = await requireUser();
  const { q, fel, borttagen } = await searchParams;
  const query = q?.trim().slice(0, 100) || null;
  const [categories, pages, all, editor] = await Promise.all([
    listCategories(db, user.studioId),
    listPages(db, user.studioId, query),
    // "Senast uppdaterade" is about every routine, also while searching.
    query ? listPages(db, user.studioId) : null,
    canEditHandbook(db, user),
  ]);
  const groups = categories.map((c) => ({ ...c, pages: pages.filter((p) => p.categoryId === c.id) })).filter((g) => g.pages.length > 0);
  const owner = user.role === "owner";

  return (
    <Page
      title={t("handbook.title")}
      description={t("handbook.intro")}
      className="max-w-6xl"
      actions={
        editor && categories.length > 0 ? (
          <ButtonLink href="/handbok/ny">
            <Plus aria-hidden="true" />
            {t("handbook.new")}
          </ButtonLink>
        ) : undefined
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {fel === "behorighet" && <Notice tone="warning">{t("handbook.noAccess")}</Notice>}
          {borttagen === "1" && <Notice tone="success">{t("handbook.removed")}</Notice>}

          {(pages.length > 0 || query) && (
            <Form action="/handbok" role="search" className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" name="q" defaultValue={query ?? ""} placeholder={t("handbook.searchPlaceholder")} aria-label={t("handbook.searchLabel")} autoComplete="off" className="pl-9" />
              </div>
              <Button type="submit" variant="secondary">
                {t("search.submit")}
              </Button>
            </Form>
          )}

          {query && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span role="status">{t(pages.length === 1 ? "handbook.hitsOne" : "handbook.hits", { n: String(pages.length), q: query })}</span>
              <Link href="/handbok" className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-sm px-2 hover:text-foreground">
                <X aria-hidden="true" className="size-4" />
                {t("search.clear")}
              </Link>
            </div>
          )}

          {categories.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={t("handbook.empty")}
              description={owner ? t("handbook.emptyOwner") : t("handbook.emptyStaff")}
              action={
                owner ? (
                  <ButtonLink href="/installningar/handbok" variant="outline">
                    {t("handbook.setUp")}
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : query ? (
            // Search: the hits, by category.
            groups.map((g) => (
              <section key={g.id} className="flex flex-col gap-3" aria-labelledby={`cat-${g.id}`}>
                <MicroLabel as="h2">
                  <span id={`cat-${g.id}`}>{g.name}</span>
                </MicroLabel>
                <Surface as="div" className="overflow-hidden">
                  <ul className="divide-y divide-border">{g.pages.map((p) => <PageRow key={p.id} page={p} />)}</ul>
                </Surface>
              </section>
            ))
          ) : (
            // Every category, to open and see its routines.
            <Surface as="div" className="divide-y divide-border overflow-hidden">
              {categories.map((c) => {
                const own = pages.filter((p) => p.categoryId === c.id);
                return (
                  <details key={c.id} id={`cat-${c.id}`} className="group scroll-mt-20">
                    <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 hover:bg-accent [&::-webkit-details-marker]:hidden">
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                      <span className="min-w-0 flex-1 text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{t(own.length === 1 ? "handbook.pagesOne" : "handbook.pagesCount", { n: formatNumber(own.length) })}</span>
                    </summary>
                    <div className="border-t border-border bg-well/40">
                      {own.length === 0 ? (
                        <p className="px-4 py-3 pl-11 text-sm text-muted-foreground">{t("handbook.categoryEmpty")}</p>
                      ) : (
                        <ul className="divide-y divide-border">{own.map((p) => <PageRow key={p.id} page={p} indent />)}</ul>
                      )}
                      {editor && (
                        <Link href={`/handbok/ny?kategori=${c.id}`} className="focus-ring flex min-h-11 items-center gap-2 border-t border-border px-4 pl-11 text-sm font-medium hover:bg-accent">
                          <Plus aria-hidden="true" className="size-4" />
                          {t("handbook.newIn", { name: c.name })}
                        </Link>
                      )}
                    </div>
                  </details>
                );
              })}
            </Surface>
          )}
        </div>
        <LatestUpdates pages={all ?? pages} categories={categories} />
      </div>
    </Page>
  );
}

/** One routine in a list: its title, a line of its text, and when it was last changed. */
function PageRow({ page, indent = false }: { page: PageListItem; indent?: boolean }) {
  return (
    <li>
      <Link href={`/handbok/${page.id}`} className={cn("focus-ring flex flex-col gap-1 px-4 py-3 hover:bg-accent", indent && "pl-11")}>
        <span className="text-sm font-medium">{page.title}</span>
        {page.excerpt && <span className="line-clamp-2 text-xs text-muted-foreground">{page.excerpt}</span>}
        <span className="text-xs text-muted-foreground tabular-nums">{t("handbook.updated", { date: formatDay(todayInStockholm(page.updatedAt)) })}</span>
      </Link>
    </li>
  );
}

/** How many routines "Senast uppdaterade" shows. */
const latestCount = 6;

/** The routines changed most recently, beside the categories on larger screens and below them on phones. */
function LatestUpdates({ pages, categories }: { pages: PageListItem[]; categories: { id: string; name: string }[] }) {
  const latest = [...pages].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, latestCount);
  if (latest.length === 0) return null;
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  return (
    <aside aria-labelledby="latest" className="flex flex-col gap-2 lg:sticky lg:top-20 lg:self-start">
      <MicroLabel as="h2" className="px-2">
        <span id="latest">{t("handbook.latest")}</span>
      </MicroLabel>
      <ul className="flex flex-col gap-0.5">
        {latest.map((p) => (
          <li key={p.id}>
            <Link href={`/handbok/${p.id}`} className="focus-ring flex flex-col gap-0.5 rounded-md px-2 py-2 hover:bg-accent">
              <span className="text-sm font-medium">{p.title}</span>
              <span className="text-xs text-muted-foreground">
                {categoryName.get(p.categoryId)} · {formatDay(todayInStockholm(p.updatedAt))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

