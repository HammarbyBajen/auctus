import Link from "next/link";
import { signOut } from "@/app/actions";
import { db } from "@/db";
import { formatDateTime } from "@/lib/format";
import { bannerFor, getSyncStatus } from "@/lib/mana/status";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const banner = bannerFor(await getSyncStatus(db, user.studioId), new Date());

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-4">
        <nav className="flex flex-wrap gap-5 text-lg">
          <Link href="/" className="font-semibold">
            {t("nav.home")}
          </Link>
          <Link href="/leads">{t("nav.leads")}</Link>
          {can(user.role, "settings", "manage") && <Link href="/installningar">{t("nav.settings")}</Link>}
        </nav>
        <form action={signOut}>
          <button className="rounded-lg border border-stone-300 px-4 py-2">{t("nav.signOut")}</button>
        </form>
      </header>
      {banner && (
        <p
          role={banner.tone === "red" ? "alert" : "status"}
          className={`mt-4 rounded-lg px-4 py-3 ${
            banner.tone === "red" ? "bg-red-100 text-red-900" : banner.tone === "amber" ? "bg-amber-100" : "bg-stone-200"
          }`}
        >
          {banner.kind === "failed" && t("mana.banner.failed", { error: banner.error })}
          {banner.kind === "never" && t("mana.banner.never")}
          {banner.kind === "stale" && t("mana.banner.stale", { when: formatDateTime(banner.since) })}
          {banner.kind === "running" &&
            (banner.total === null
              ? t("mana.banner.runningNoTotal", { done: String(banner.done) })
              : t("mana.banner.running", { done: String(banner.done), total: String(banner.total) }))}
        </p>
      )}
      <div className="flex-1 py-6">{children}</div>
    </div>
  );
}
