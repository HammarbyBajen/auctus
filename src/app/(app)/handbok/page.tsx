import Form from "next/form";
import Link from "next/link";
import { BookOpen, Plus, Search, X } from "lucide-react";
import { db } from "@/db";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/empty-state";
import { MicroLabel } from "@/components/app/micro-label";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Surface } from "@/components/app/surface";
import { formatDay } from "@/lib/format";
import { canEditHandbook, listCategories, listPages } from "@/lib/handbook/service";
import { todayInStockholm } from "@/lib/tasks/dates";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";
import { HandbookNav } from "./handbook-nav";

/**
 * Handbok (ticket 37): the studio's routines, by category, with a search
 * across all their text. Everyone on the staff reads; owners and the people
 * they choose write.
 */
export default async function HandbookPage({ searchParams }: { searchParams: Promise<{ q?: string; fel?: string; borttagen?: string }> }) {
  const user = await requireUser();
  const { q, fel, borttagen } = await searchParams;
  const query = q?.trim().slice(0, 100) || null;
  const [categories, pages, all, editor] = await Promise.all([
    listCategories(db, user.studioId),
    listPages(db, user.studioId, query),
    // The sidebar shows every routine, also while searching.
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

          {groups.length === 0 && !query ? (
            <EmptyState
              icon={BookOpen}
              title={t("handbook.empty")}
              description={categories.length === 0 ? (owner ? t("handbook.emptyOwner") : t("handbook.emptyStaff")) : editor ? t("handbook.emptyEditor") : t("handbook.emptyStaff")}
              action={
                categories.length === 0 && owner ? (
                  <ButtonLink href="/installningar/handbok" variant="outline">
                    {t("handbook.setUp")}
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            groups.map((g) => (
              <section key={g.id} className="flex flex-col gap-3" aria-labelledby={`cat-${g.id}`}>
                <MicroLabel as="h2">
                  <span id={`cat-${g.id}`}>{g.name}</span>
                </MicroLabel>
                <Surface as="div" className="overflow-hidden">
                  <ul className="divide-y divide-border">
                    {g.pages.map((p) => (
                      <li key={p.id}>
                        <Link href={`/handbok/${p.id}`} className="focus-ring flex flex-col gap-1 px-4 py-3 hover:bg-accent">
                          <span className="text-sm font-medium">{p.title}</span>
                          {p.excerpt && <span className="line-clamp-2 text-xs text-muted-foreground">{p.excerpt}</span>}
                          <span className="text-xs text-muted-foreground tabular-nums">{t("handbook.updated", { date: formatDay(todayInStockholm(p.updatedAt)) })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Surface>
              </section>
            ))
          )}
        </div>
        <HandbookNav categories={categories} pages={all ?? pages} />
      </div>
    </Page>
  );
}
