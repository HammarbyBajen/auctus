import { db } from "@/db";
import { getHomeData } from "@/lib/home/service";
import { listLeads } from "@/lib/leads/service";
import { rowChip } from "@/lib/leads/row";
import { formatDay } from "@/lib/format";
import { isGreyedOut, todayInStockholm } from "@/lib/tasks/dates";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { LeadDetailPane, LeadList, type LeadRow } from "./lead-list";

/** Leads as a split pane: the list on the left, the selected lead (or the new-lead form) on the right. */
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("leads", "read");
  const [rows, home] = await Promise.all([listLeads(db, user.studioId), getHomeData(db, user.studioId, user.id, "all")]);
  const reasonsById = new Map(home.items.map((i) => [i.lead.id, i.reasons]));

  const toRow = (r: (typeof rows)[number]): LeadRow => {
    const chip = rowChip({ reasons: reasonsById.get(r.lead.id) ?? [], stageKind: r.stage.kind });
    const source = t(`source.${r.lead.source}` as MessageKey) || t("source.unknown");
    return {
      id: r.lead.id,
      name: r.person.name,
      meta: `${r.stage.name} · ${source} · ${formatDay(todayInStockholm(r.lead.createdAt))}`,
      assignedElsewhere: isGreyedOut(r.lead.assignedToId, user.id) && r.assigneeName ? t("assign.assignedTo", { name: r.assigneeName }) : null,
      chip: chip ? { tone: chip.tone, label: t(`chip.${chip.key}` as MessageKey) } : null,
    };
  };

  const byId = new Map(rows.map((r) => [r.lead.id, r]));
  const needsAction = home.items.map((i) => byId.get(i.lead.id)).filter((r): r is (typeof rows)[number] => Boolean(r)).map(toRow);
  const all = rows.map(toRow);

  return (
    <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
      <LeadList
        title={t("leads.title")}
        needsAction={needsAction}
        all={all}
        needsActionLabel={t("leads.needsAction")}
        allLabel={t("leads.all")}
      />
      <LeadDetailPane>{children}</LeadDetailPane>
    </div>
  );
}
