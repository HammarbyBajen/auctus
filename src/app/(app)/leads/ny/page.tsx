import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";
import { LeadForm } from "./lead-form";

export default async function NewLeadPage() {
  await requirePermission("leads", "write");
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader title={t("leadForm.title")} />
      <Card>
        <CardContent className="pt-2">
          <LeadForm />
        </CardContent>
      </Card>
    </div>
  );
}
