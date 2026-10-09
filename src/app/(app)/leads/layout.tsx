import { db } from "@/db";
import { getPipeline } from "@/lib/leads/pipeline-view";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";
import { LeadList, LeadsShell } from "./lead-list";

/** Leads: the pipeline on its own page, and a split pane (list beside the lead) when a lead is open. */
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("leads", "read");
  const { groups, needsAction } = await getPipeline(db, user.studioId, user.id);
  return (
    <LeadsShell list={<LeadList title={t("leads.title")} needsAction={needsAction} groups={groups} needsActionLabel={t("leads.needsAction")} />}>
      {children}
    </LeadsShell>
  );
}
