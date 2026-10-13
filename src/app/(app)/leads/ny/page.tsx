import { db } from "@/db";
import { Page } from "@/components/app/page";
import { listLeadFields } from "@/lib/pipeline/service";
import { Surface } from "@/components/app/surface";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";
import { LeadForm } from "./lead-form";

export default async function NewLeadPage() {
  const user = await requirePermission("leads", "write");
  const fields = await listLeadFields(db, user.studioId);
  return (
    <Page title={t("leadForm.title")} description={t("leadForm.intro")} className="mx-auto w-full max-w-2xl">
      <Surface className="p-4 sm:p-6">
        <LeadForm fields={fields} />
      </Surface>
    </Page>
  );
}
