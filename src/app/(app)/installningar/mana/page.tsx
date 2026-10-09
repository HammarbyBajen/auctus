import { db } from "@/db";
import { formatDateTime } from "@/lib/format";
import { getAddOnMembershipIds, getIgnoredMembershipIds, listMembershipKinds } from "@/lib/mana/leads";
import { getSyncStatus } from "@/lib/mana/status";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { saveMembershipRules, saveWinBackSetting, syncNow } from "./actions";
import { eq } from "drizzle-orm";
import { studioSettings } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ManaPage({
  searchParams,
}: {
  searchParams: Promise<{ startad?: string; sparat?: string; vinnsparat?: string }>;
}) {
  const user = await requirePermission("settings", "manage");
  const { startad, sparat, vinnsparat } = await searchParams;
  const [status, kinds, ignored, addOns, [settings]] = await Promise.all([
    getSyncStatus(db, user.studioId),
    listMembershipKinds(db, user.studioId),
    getIgnoredMembershipIds(db, user.studioId),
    getAddOnMembershipIds(db, user.studioId),
    db
      .select({ winBackEnabled: studioSettings.winBackEnabled })
      .from(studioSettings)
      .where(eq(studioSettings.studioId, user.studioId))
      .limit(1),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("mana.title")}</h1>
      <p className="text-lg text-stone-700">{t("mana.intro")}</p>
      {!status.configured && <p className="rounded-lg bg-amber-100 px-4 py-3">{t("mana.notConfigured")}</p>}
      {startad === "1" && <p className="rounded-lg bg-stone-200 px-4 py-3">{t("mana.started")}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-lg">
        <dt className="text-stone-600">{t("mana.lastSuccess")}</dt>
        <dd>{status.lastSuccessAt ? formatDateTime(status.lastSuccessAt) : t("mana.never")}</dd>
        <dt className="text-stone-600">{t("mana.members")}</dt>
        <dd>{status.members}</dd>
        <dt className="text-stone-600">{t("mana.memberships")}</dt>
        <dd>{status.memberships}</dd>
      </dl>

      <form action={syncNow}>
        <button
          disabled={!status.configured || Boolean(status.running)}
          className="rounded-lg bg-stone-900 px-4 py-3 text-lg font-medium text-white disabled:opacity-50"
        >
          {status.running ? t("mana.syncing") : t("mana.syncNow")}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("mana.rulesTitle")}</h2>
        <p className="text-stone-700">{t("mana.rulesIntro")}</p>
        {sparat === "1" && <p className="rounded-lg bg-stone-200 px-4 py-3">{t("mana.rulesSaved")}</p>}
        {kinds.length === 0 ? (
          <p className="text-stone-600">{t("mana.rulesEmpty")}</p>
        ) : (
          <form action={saveMembershipRules} className="flex flex-col gap-3">
            {kinds.map((k) => (
              <fieldset key={k.membershipId} className="flex flex-col gap-1 rounded-lg border border-stone-200 bg-white px-4 py-3">
                <legend className="sr-only">{k.name}</legend>
                <label className="flex items-center gap-3 text-lg">
                  <input
                    type="checkbox"
                    name="counts"
                    value={k.membershipId}
                    defaultChecked={!ignored.includes(k.membershipId)}
                    className="h-5 w-5"
                  />
                  <span>
                    {k.name} <span className="text-stone-500">({t("mana.rulesActive", { n: String(k.active) })})</span>
                  </span>
                </label>
                <label className="flex items-center gap-3 pl-8 text-stone-700">
                  <input
                    type="checkbox"
                    name="addOn"
                    value={k.membershipId}
                    defaultChecked={addOns.includes(k.membershipId)}
                    className="h-4 w-4"
                  />
                  {t("mana.rulesAddOn")}
                </label>
              </fieldset>
            ))}
            <button className="self-start rounded-lg bg-stone-900 px-4 py-3 text-lg font-medium text-white">
              {t("mana.rulesSave")}
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("mana.winbackTitle")}</h2>
        <p className="text-stone-700">{t("mana.winbackIntro")}</p>
        {vinnsparat === "1" && <p className="rounded-lg bg-stone-200 px-4 py-3">{t("mana.winbackSaved")}</p>}
        <form action={saveWinBackSetting} className="flex flex-col gap-3">
          <label className="flex items-center gap-3 text-lg">
            <input type="checkbox" name="enabled" defaultChecked={settings?.winBackEnabled ?? false} className="h-5 w-5" />
            {t("mana.winbackOn")}
          </label>
          <button className="self-start rounded-lg bg-stone-900 px-4 py-3 text-lg font-medium text-white">
            {t("mana.winbackSave")}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("mana.recent")}</h2>
        <ul className="flex flex-col gap-2">
          {status.recentRuns.map((run) => (
            <li key={run.id} className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="font-medium">{t(`mana.run.${run.status}` as MessageKey)}</p>
              <p className="text-sm text-stone-600">{formatDateTime(run.startedAt)}</p>
              {run.error && <p className="text-sm text-red-700">{run.error}</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
