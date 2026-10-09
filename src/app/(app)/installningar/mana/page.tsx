import { db } from "@/db";
import { formatDateTime } from "@/lib/format";
import { getSyncStatus } from "@/lib/mana/status";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { syncNow } from "./actions";

export const dynamic = "force-dynamic";

export default async function ManaPage({ searchParams }: { searchParams: Promise<{ startad?: string }> }) {
  const user = await requirePermission("settings", "manage");
  const { startad } = await searchParams;
  const status = await getSyncStatus(db, user.studioId);

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
