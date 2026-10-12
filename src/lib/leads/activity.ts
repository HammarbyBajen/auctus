import type { HistoryItem } from "./service";
import { todayInStockholm } from "@/lib/tasks/dates";

/** A history entry as shown: a logged contact can carry the note written with it. */
export type ActivityItem = HistoryItem | (Extract<HistoryItem, { kind: "contact_logged" }> & { note: string });

/** How close a note must be to a logged contact, by the same person, to count as written with it. */
const sameMomentMs = 10_000;

/**
 * Joins each logged contact with a note saved in the same go ("Ringde" plus
 * what was said), so the history shows them as one entry. Order is kept,
 * newest first.
 */
export function groupActivity(items: HistoryItem[]): ActivityItem[] {
  // Pair first, then build the list: the note is saved just after its contact, so it comes first.
  const noteFor = new Map<string, string>();
  const paired = new Set<string>();
  for (const item of items) {
    if (item.kind !== "contact_logged") continue;
    const note = items.find(
      (n): n is Extract<HistoryItem, { kind: "note" }> =>
        n.kind === "note" &&
        !paired.has(n.id) &&
        n.authorName === item.authorName &&
        Math.abs(n.at.getTime() - item.at.getTime()) <= sameMomentMs,
    );
    if (note) {
      paired.add(note.id);
      noteFor.set(item.id, note.body);
    }
  }
  return items.flatMap((item): ActivityItem[] => {
    if (item.kind === "note" && paired.has(item.id)) return [];
    if (item.kind === "contact_logged" && noteFor.has(item.id)) return [{ ...item, note: noteFor.get(item.id)! }];
    return [item];
  });
}

/** Whole days from one calendar day to another (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** How many days ago something happened, in Tegen's time zone (0 = today). */
export function daysAgo(at: Date, today: string = todayInStockholm()): number {
  return daysBetween(todayInStockholm(at), today);
}
