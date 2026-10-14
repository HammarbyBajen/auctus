import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/app/confirm-button";
import { NativeSelect } from "@/components/app/native-select";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { listInstructors, listPeople } from "@/lib/salary/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { removePersonAction, savePersonAction } from "../actions";

export const dynamic = "force-dynamic";

const errors = ["invalid", "instructor_taken", "not_found"];

type PersonRow = Awaited<ReturnType<typeof listPeople>>[number];

/** The fields of one coach, for adding and for editing. */
function PersonFields({ person, instructors, taken, idPrefix }: { person?: PersonRow; instructors: { id: string; name: string }[]; taken: Set<string>; idPrefix: string }) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("name")}>{t("salary.person.name")}</Label>
        <Input id={id("name")} name="name" required maxLength={100} defaultValue={person?.name} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("instructor")}>{t("salary.person.instructor")}</Label>
        <NativeSelect id={id("instructor")} name="manaInstructorId" defaultValue={person?.manaInstructorId ?? ""}>
          <option value="">{t("salary.person.noInstructor")}</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id} disabled={taken.has(i.id) && i.id !== person?.manaInstructorId}>
              {i.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("free")}>{t("salary.person.free")}</Label>
        <Input id={id("free")} name="freeClassesPerWeek" type="number" inputMode="numeric" min={0} max={20} required defaultValue={String(person?.freeClassesPerWeek ?? 0)} className="w-28" aria-describedby={id("free-hint")} />
        <p id={id("free-hint")} className="text-xs text-muted-foreground">
          {t("salary.person.freeHint")}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("from")}>{t("salary.person.activeFrom")}</Label>
        <Input id={id("from")} name="activeFrom" type="date" defaultValue={person?.activeFrom ?? ""} className="w-44" aria-describedby={id("from-hint")} />
        <p id={id("from-hint")} className="text-xs text-muted-foreground">
          {t("salary.person.activeFromHint")}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={id("notes")}>{t("salary.person.notes")}</Label>
        <Textarea id={id("notes")} name="notes" rows={2} maxLength={2000} defaultValue={person?.notes} />
      </div>
    </div>
  );
}

/** The coaches: who they are in Mana, and their free classes (ticket 20). Owners only. */
export default async function SalaryPeoplePage({ searchParams }: { searchParams: Promise<{ sparat?: string; borttagen?: string; fel?: string }> }) {
  const user = await requirePermission("salary", "read");
  const { sparat, borttagen, fel } = await searchParams;
  const [people, instructors] = await Promise.all([listPeople(db, user.studioId), listInstructors(db, user.studioId)]);
  const taken = new Set(people.map((p) => p.manaInstructorId).filter((id): id is string => Boolean(id)));
  const instructorName = new Map(instructors.map((i) => [i.id, i.name]));
  const error = errors.find((e) => e === fel);

  return (
    <Page
      title={t("salary.people")}
      description={t("salary.peopleIntro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/lon" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("salary.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("salary.person.saved")}</Notice>}
      {borttagen === "1" && <Notice tone="success">{t("salary.person.removed")}</Notice>}
      {error && <Notice tone="danger">{t(`salary.person.error.${error}` as MessageKey)}</Notice>}
      {instructors.length === 0 && <Notice tone="info">{t("salary.person.noInstructors")}</Notice>}

      {people.length > 0 && (
        <ul className="flex flex-col gap-3">
          {people.map((p) => (
            <li key={p.id}>
              <details className="group rounded-lg bg-card elevation-1">
                <summary className="focus-ring flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-4 py-3 hover:bg-accent sm:px-5">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.manaInstructorId ? (instructorName.get(p.manaInstructorId) ?? t("salary.person.unknownInstructor")) : t("salary.person.noInstructor")} ·{" "}
                    {t("salary.person.freeShort", { n: String(p.freeClassesPerWeek) })}
                  </span>
                </summary>
                <div className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
                  <form action={savePersonAction.bind(null, p.id)} className="flex flex-col gap-4">
                    <PersonFields person={p} instructors={instructors} taken={taken} idPrefix={`p-${p.id}`} />
                    <SubmitButton className="self-start">{t("salary.person.save")}</SubmitButton>
                  </form>
                  <form action={removePersonAction.bind(null, p.id)}>
                    <ConfirmButton variant="ghost" size="sm" confirmLabel={t("salary.person.removeConfirm")}>
                      {t("salary.person.remove")}
                    </ConfirmButton>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <Panel title={t("salary.person.addTitle")} id="ny">
        <form action={savePersonAction.bind(null, null)} className="flex flex-col gap-4">
          <PersonFields instructors={instructors} taken={taken} idPrefix="ny" />
          <SubmitButton className="self-start">{t("salary.person.add")}</SubmitButton>
        </form>
      </Panel>
    </Page>
  );
}
