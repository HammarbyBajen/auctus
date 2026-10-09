import { db as defaultDb } from "@/db";
import { getHomeData } from "@/lib/home/service";
import { listLeads } from "@/lib/leads/service";
import { rowChip, type ChipTone } from "@/lib/leads/row";
import { listStages } from "@/lib/pipeline/service";
import { formatDay } from "@/lib/format";
import { isGreyedOut, todayInStockholm } from "@/lib/tasks/dates";
import { t, type MessageKey } from "@/lib/i18n";

type Db = typeof defaultDb;

export type LeadCard = {
  id: string;
  name: string;
  stageKey: string;
  meta: string;
  assignedElsewhere: string | null;
  chip: { tone: ChipTone; label: string } | null;
};

export type StageGroup = { key: string; name: string; kind: string; cards: LeadCard[] };

/**
 * The leads of a studio grouped by pipeline stage, in the studio's stage order
 * (New lead, Contacted, ... then Won and Cold). Within a stage the leads that
 * need action come first, most urgent first, then the rest newest first.
 */
export async function getPipeline(db: Db, studioId: string, viewerId: string) {
  const [rows, home, stages] = await Promise.all([
    listLeads(db, studioId),
    getHomeData(db, studioId, viewerId, "all"),
    listStages(db, studioId),
  ]);
  const urgency = new Map(home.items.map((item, index) => [item.lead.id, { index, reasons: item.reasons }]));

  const toCard = (r: (typeof rows)[number]): LeadCard => {
    const chip = rowChip({ reasons: urgency.get(r.lead.id)?.reasons ?? [], stageKind: r.stage.kind });
    const source = t(`source.${r.lead.source}` as MessageKey) || t("source.unknown");
    return {
      id: r.lead.id,
      name: r.person.name,
      stageKey: r.stage.key,
      meta: `${source} · ${formatDay(todayInStockholm(r.lead.createdAt))}`,
      assignedElsewhere: isGreyedOut(r.lead.assignedToId, viewerId) && r.assigneeName ? t("assign.assignedTo", { name: r.assigneeName }) : null,
      chip: chip ? { tone: chip.tone, label: t(`chip.${chip.key}` as MessageKey) } : null,
    };
  };

  const ordered = [...rows].sort((a, b) => {
    const ua = urgency.get(a.lead.id)?.index ?? Number.MAX_SAFE_INTEGER;
    const ub = urgency.get(b.lead.id)?.index ?? Number.MAX_SAFE_INTEGER;
    if (ua !== ub) return ua - ub;
    return b.lead.createdAt.getTime() - a.lead.createdAt.getTime();
  });

  const groups: StageGroup[] = stages.map((s) => ({
    key: s.key,
    name: s.name,
    kind: s.kind,
    cards: ordered.filter((r) => r.stage.key === s.key).map(toCard),
  }));
  const needsAction = home.items
    .map((item) => rows.find((r) => r.lead.id === item.lead.id))
    .filter((r): r is (typeof rows)[number] => Boolean(r))
    .map(toCard);
  return { groups, needsAction, total: rows.length };
}
