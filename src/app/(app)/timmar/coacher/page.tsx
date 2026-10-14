import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDay } from "@/lib/format";
import { listCoaches } from "@/lib/salary/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { saveDealAction } from "../actions";

export const dynamic = "force-dynamic";

const errors = ["invalid", "not_found"];

/**
 * The coaches, straight from Mana's instructors: nothing to create here. The
 * only thing set in Tegen HQ is each coach's free-class deal (ticket 20).
 * Owners only.
 */
export default async function CoachesPage({ searchParams }: { searchParams: Promise<{ sparat?: string; fel?: string }> }) {
  const user = await requirePermission("salary", "read");
  const { sparat, fel } = await searchParams;
  const coaches = await listCoaches(db, user.studioId);
  const error = errors.find((e) => e === fel);

  return (
    <Page
      title={t("salary.coaches")}
      description={t("salary.coachesIntro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/timmar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("salary.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("salary.coach.saved")}</Notice>}
      {error && <Notice tone="danger">{t(`salary.coach.error.${error}` as MessageKey)}</Notice>}
      {coaches.length === 0 && <Notice tone="info">{t("salary.coach.none")}</Notice>}

      {coaches.length > 0 && (
        <ul className="flex flex-col gap-2">
          {coaches.map((c) => {
            const id = (name: string) => `${c.id}-${name}`;
            return (
              <li key={c.id}>
                <details className="group rounded-lg bg-card elevation-1">
                  <summary className="focus-ring flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-4 py-3 hover:bg-accent sm:px-5">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.freeClassesPerWeek > 0
                        ? c.activeFrom
                          ? t("salary.coach.dealFrom", { n: String(c.freeClassesPerWeek), from: formatDay(c.activeFrom) })
                          : t("salary.coach.deal", { n: String(c.freeClassesPerWeek) })
                        : t("salary.coach.noDeal")}
                    </span>
                  </summary>
                  <form action={saveDealAction.bind(null, c.id)} className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={id("free")}>{t("salary.coach.free")}</Label>
                        <Input
                          id={id("free")}
                          name="freeClassesPerWeek"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={20}
                          required
                          defaultValue={String(c.freeClassesPerWeek)}
                          className="w-28"
                          aria-describedby={id("free-hint")}
                        />
                        <p id={id("free-hint")} className="text-xs text-muted-foreground">
                          {t("salary.coach.freeHint")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={id("from")}>{t("salary.coach.activeFrom")}</Label>
                        <Input id={id("from")} name="activeFrom" type="date" defaultValue={c.activeFrom ?? ""} className="w-44" aria-describedby={id("from-hint")} />
                        <p id={id("from-hint")} className="text-xs text-muted-foreground">
                          {t("salary.coach.activeFromHint")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:col-span-2">
                        <Label htmlFor={id("notes")}>{t("salary.coach.notes")}</Label>
                        <Textarea id={id("notes")} name="notes" rows={2} maxLength={2000} defaultValue={c.notes} />
                      </div>
                    </div>
                    <SubmitButton className="self-start">{t("salary.coach.save")}</SubmitButton>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
