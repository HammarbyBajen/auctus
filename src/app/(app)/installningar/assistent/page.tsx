import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { aiBudget, aiModel, hasAiKey } from "@/lib/ai/client";
import { healthTerms } from "@/lib/ai/privacy";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";
import { saveAiSettings } from "./actions";

export const dynamic = "force-dynamic";

const usd = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The assistant (ticket 30): whether it is on, what it costs this month against the cap, and the words that keep a note from it. Owners only. */
export default async function AssistantSettingsPage({ searchParams }: { searchParams: Promise<{ sparat?: string; fel?: string }> }) {
  const user = await requirePermission("settings", "manage");
  const { sparat, fel } = await searchParams;
  const [budget, [row]] = await Promise.all([
    aiBudget(db, user.studioId),
    db.select({ ai: studioSettings.aiSettings }).from(studioSettings).where(eq(studioSettings.studioId, user.studioId)).limit(1),
  ]);
  const on = hasAiKey();

  return (
    <Page
      title={t("ai.title")}
      description={t("ai.intro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("ai.saved")}</Notice>}
      {fel === "budget" && <Notice tone="danger">{t("ai.errorBudget")}</Notice>}
      <Notice tone={on ? "info" : "warning"}>{on ? t("ai.on", { model: aiModel() }) : t("ai.off")}</Notice>

      <form action={saveAiSettings} className="flex flex-col gap-6">
        <Panel title={t("ai.costTitle")} id="kostnad">
          <p className="text-sm tabular-nums">{t("ai.spent", { spent: usd(budget.spentUsd), budget: usd(budget.budgetUsd) })}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-budget">{t("ai.budgetLabel")}</Label>
            <Input id="ai-budget" name="budget" type="number" inputMode="decimal" min={0} max={1000} step="1" required defaultValue={String(budget.budgetUsd)} className="w-32" aria-describedby="ai-budget-hint" />
            <p id="ai-budget-hint" className="text-xs text-muted-foreground">{t("ai.budgetHint")}</p>
          </div>
        </Panel>

        <Panel title={t("ai.privacyTitle")} id="integritet">
          <p className="text-sm text-muted-foreground">{t("ai.privacyIntro")}</p>
          <details className="text-sm">
            <summary className="focus-ring cursor-pointer rounded-xs font-medium">{t("ai.builtInTerms", { n: String(healthTerms.length) })}</summary>
            <p className="mt-2 text-xs break-words text-muted-foreground">{healthTerms.map((w) => w.replace("*", "…")).join(", ")}</p>
          </details>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-terms">{t("ai.termsLabel")}</Label>
            <Textarea id="ai-terms" name="terms" rows={4} defaultValue={(row?.ai?.healthTerms ?? []).join("\n")} aria-describedby="ai-terms-hint" className="max-w-md" />
            <p id="ai-terms-hint" className="text-xs text-muted-foreground">{t("ai.termsHint")}</p>
          </div>
        </Panel>

        <SubmitButton className="self-start">{t("ai.save")}</SubmitButton>
      </form>
    </Page>
  );
}
