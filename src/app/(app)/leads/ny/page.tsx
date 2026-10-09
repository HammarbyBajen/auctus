import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";
import { LeadForm } from "./lead-form";

export default async function NewLeadPage() {
  await requirePermission("leads", "write");
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("leadForm.title")}</h1>
      <LeadForm />
    </main>
  );
}
