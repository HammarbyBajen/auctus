import { ArrowDown, ArrowLeft, ArrowUp, Trash2 } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { countByCategory, getHandbookEditors, listCategories } from "@/lib/handbook/service";
import { listUsers } from "@/lib/users/service";
import { requirePermission } from "@/lib/session";
import { formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { addCategory, deleteCategoryAction, moveCategoryAction, renameCategoryAction, saveEditors } from "./actions";

/** Handbok's settings (ticket 37): its categories, and who besides the owners may write. Owners only. */
export default async function HandbookSettingsPage({ searchParams }: { searchParams: Promise<{ sparat?: string; fel?: string; redaktorer?: string }> }) {
  const user = await requirePermission("settings", "manage");
  const { sparat, fel, redaktorer } = await searchParams;
  const [categories, counts, people, editors] = await Promise.all([
    listCategories(db, user.studioId),
    countByCategory(db, user.studioId),
    listUsers(db, user.studioId),
    getHandbookEditors(db, user.studioId),
  ]);
  const staff = people.filter((p) => p.active && p.role !== "owner");

  return (
    <Page
      title={t("handbook.settingsTitle")}
      description={t("handbook.settingsIntro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      <Panel title={t("handbook.categoriesTitle")} id="kategorier">
        <p className="text-sm text-muted-foreground">{t("handbook.categoriesIntro")}</p>
        {sparat === "1" && <Notice tone="success">{t("handbook.settingsSaved")}</Notice>}
        {fel === "namn" && <Notice tone="danger">{t("handbook.errorName")}</Notice>}
        {fel === "anvands" && <Notice tone="danger">{t("handbook.errorInUse")}</Notice>}
        {categories.length > 0 && (
          <ul className="flex flex-col gap-2">
            {categories.map((c, i) => {
              const { active: n, archived } = counts.get(c.id) ?? { active: 0, archived: 0 };
              return (
                <li key={c.id} className="flex flex-col gap-2 rounded-md bg-well p-2 sm:flex-row sm:items-center">
                  <form action={renameCategoryAction.bind(null, c.id)} className="flex min-w-0 flex-1 gap-2">
                    <Input name="name" defaultValue={c.name} required maxLength={80} aria-label={t("handbook.categoryName")} className="min-w-0 flex-1" />
                    <SubmitButton variant="ghost" size="sm" keepLabel>
                      {t("handbook.rename")}
                    </SubmitButton>
                  </form>
                  <div className="flex items-center gap-1">
                    <span className="px-2 text-xs text-muted-foreground tabular-nums">{t(n === 1 ? "handbook.pagesOne" : "handbook.pagesCount", { n: formatNumber(n) })}
                      {archived > 0 ? ` · ${t("handbook.archivedCount", { n: formatNumber(archived) })}` : ""}
                    </span>
                    <form action={moveCategoryAction.bind(null, c.id, "up")}>
                      <SubmitButton variant="ghost" size="icon" disabled={i === 0} aria-label={t("handbook.moveUp", { name: c.name })} keepLabel>
                        <ArrowUp aria-hidden="true" />
                      </SubmitButton>
                    </form>
                    <form action={moveCategoryAction.bind(null, c.id, "down")}>
                      <SubmitButton variant="ghost" size="icon" disabled={i === categories.length - 1} aria-label={t("handbook.moveDown", { name: c.name })} keepLabel>
                        <ArrowDown aria-hidden="true" />
                      </SubmitButton>
                    </form>
                    <form action={deleteCategoryAction.bind(null, c.id)}>
                      <SubmitButton variant="ghost" size="icon" disabled={n + archived > 0} aria-label={t("handbook.deleteCategory", { name: c.name })} title={n + archived > 0 ? t("handbook.errorInUse") : undefined} keepLabel>
                        <Trash2 aria-hidden="true" />
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <form action={addCategory} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="new-category">{t("handbook.newCategory")}</Label>
            <Input id="new-category" name="name" required maxLength={80} placeholder={t("handbook.newCategoryPlaceholder")} autoComplete="off" />
          </div>
          <SubmitButton variant="outline">{t("handbook.addCategory")}</SubmitButton>
        </form>
      </Panel>

      <Panel title={t("handbook.editorsTitle")} id="redaktorer">
        <p className="text-sm text-muted-foreground">{t("handbook.editorsIntro")}</p>
        {redaktorer === "1" && <Notice tone="success">{t("handbook.settingsSaved")}</Notice>}
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("handbook.editorsEmpty")}</p>
        ) : (
          <form action={saveEditors} className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">{t("handbook.editorsTitle")}</legend>
              {staff.map((p) => (
                <Label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal hover:bg-accent">
                  <Checkbox name="editor" value={p.id} defaultChecked={editors.includes(p.id)} />
                  {p.name}
                </Label>
              ))}
            </fieldset>
            <SubmitButton variant="outline" className="self-start">
              {t("handbook.saveEditors")}
            </SubmitButton>
          </form>
        )}
      </Panel>
    </Page>
  );
}
