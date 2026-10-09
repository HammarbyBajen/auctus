import type { Reason } from "@/lib/home/attention";

export type ChipTone = "destructive" | "warning" | "success";

/**
 * The one tinted chip a lead row may carry (docs/DESIGN.md: at most one per
 * row, and only for a real state). Overdue first contact or task wins, then
 * something due soon, then a lead that became a member. Everything else is
 * plain text.
 */
export function rowChip(input: { reasons: Reason[]; stageKind: string }): { tone: ChipTone; key: "overdue" | "soon" | "won" } | null {
  if (input.reasons.some((r) => r.type === "first_contact_overdue" || r.type === "task_overdue")) {
    return { tone: "destructive", key: "overdue" };
  }
  if (input.reasons.some((r) => r.type === "first_contact_soon" || r.type === "task_today")) {
    return { tone: "warning", key: "soon" };
  }
  if (input.stageKind === "won") return { tone: "success", key: "won" };
  return null;
}
