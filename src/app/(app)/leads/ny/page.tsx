import { Page } from "@/components/app/page";
import { Surface } from "@/components/app/surface";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";
import { LeadForm } from "./lead-form";

export default async function NewLeadPage() {
  await requirePermission("leads", "write");
  return (
    <Page title={t("leadForm.title")} description={t("leadForm.intro")} className="mx-auto w-full max-w-2xl">
      <Surface className="p-4 sm:p-6">
        <LeadForm />
      </Surface>
    </Page>
  );
}
