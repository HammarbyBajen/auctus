import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/app/chip";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { listRules } from "@/lib/salary/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { setRuleAction } from "../actions";

export const dynamic = "force-dynamic";

const sources: { key: string; title: MessageKey }[] = [
  { key: "class", title: "salary.rules.classes" },
  { key: "service", title: "salary.rules.services" },
  { key: "course", title: "salary.rules.courses" },
];

/** Whether each kind of work found in Mana is paid (ticket 21). Owners only. */
export default async function SalaryRulesPage({ searchParams }: { searchParams: Promise<{ sparat?: string }> }) {
  const user = await requirePermission("salary", "read");
  const { sparat } = await searchParams;
  const rules = await listRules(db, user.studioId);

  return (
    <Page
      title={t("salary.rules")}
      description={t("salary.rulesIntro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/lon" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("salary.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("salary.rules.saved")}</Notice>}
      {rules.length === 0 && <Notice tone="info">{t("salary.rules.empty")}</Notice>}

      {sources.map(({ key, title }) => {
        const list = rules.filter((r) => r.source === key);
        if (list.length === 0) return null;
        return (
          <Panel key={key} title={t(title)} id={`regler-${key}`}>
            <ul className="flex flex-col divide-y divide-border">
              {list.map((r) => {
                const value = r.paid === true ? "yes" : r.paid === false ? "no" : "";
                return (
                  <li key={r.typeKey} className="py-3 first:pt-0 last:pb-0">
                    <form action={setRuleAction.bind(null, r.typeKey)} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="min-w-40 flex-1 text-sm font-medium">
                        {r.label}{" "}
                        {r.paid === null && (
                          <Chip tone="warning" className="ml-1">
                            {t("salary.unsetChip")}
                          </Chip>
                        )}
                      </span>
                      <fieldset className="flex flex-wrap gap-1">
                        <legend className="sr-only">{t("salary.rules.legend", { name: r.label })}</legend>
                        {(
                          [
                            ["yes", "salary.rules.paid"],
                            ["no", "salary.rules.unpaid"],
                            ["", "salary.rules.unset"],
                          ] as const
                        ).map(([v, label]) => (
                          <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent sm:min-h-9">
                            <input type="radio" name="paid" value={v} defaultChecked={value === v} className="size-4 accent-primary" />
                            {t(label)}
                          </label>
                        ))}
                      </fieldset>
                      <SubmitButton variant="outline" size="sm">
                        {t("salary.rules.save")}
                      </SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </Page>
  );
}
