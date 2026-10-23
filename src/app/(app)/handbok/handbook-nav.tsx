import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MicroLabel } from "@/components/app/micro-label";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * Handbok's categories beside the text on larger screens (ticket 37): press
 * a category to see its routines. The current routine's category starts
 * open, and the routine is marked. Native open/close, so it needs no script.
 */
export function HandbookNav({
  categories,
  pages,
  currentPageId = null,
}: {
  categories: { id: string; name: string }[];
  pages: { id: string; title: string; categoryId: string }[];
  currentPageId?: string | null;
}) {
  const groups = categories.map((c) => ({ ...c, pages: pages.filter((p) => p.categoryId === c.id) })).filter((g) => g.pages.length > 0);
  if (groups.length === 0) return null;
  const currentCategory = pages.find((p) => p.id === currentPageId)?.categoryId;

  return (
    <nav aria-label={t("handbook.navLabel")} className="hidden lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6rem)] lg:flex-col lg:gap-2 lg:overflow-y-auto">
      <MicroLabel as="h2" className="px-2">
        {t("handbook.categoriesTitle")}
      </MicroLabel>
      <ul className="flex flex-col gap-0.5">
        {groups.map((g) => (
          <li key={g.id}>
            <details open={g.id === currentCategory} className="group">
              <summary className="focus-ring flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-accent [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{formatNumber(g.pages.length)}</span>
              </summary>
              <ul className="mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-border pl-2 ml-4">
                {g.pages.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/handbok/${p.id}`}
                      aria-current={p.id === currentPageId ? "page" : undefined}
                      className={cn(
                        "focus-ring block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                        p.id === currentPageId && "bg-accent font-medium text-foreground",
                      )}
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </nav>
  );
}
