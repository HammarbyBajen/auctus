/**
 * Handbok's routines by category (ticket 37), in the categories' order:
 * one helper for the front page and the sidebar, so they always agree.
 * Pure, so it is tested on its own.
 */
export function groupByCategory<C extends { id: string }, P extends { categoryId: string }>(
  categories: C[],
  pages: P[],
  options: { keepEmpty?: boolean } = {},
): (C & { pages: P[] })[] {
  const groups = categories.map((c) => ({ ...c, pages: pages.filter((p) => p.categoryId === c.id) }));
  return options.keepEmpty ? groups : groups.filter((g) => g.pages.length > 0);
}
