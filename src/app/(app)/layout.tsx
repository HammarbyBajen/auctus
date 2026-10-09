import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { db } from "@/db";
import { BottomNav, TopNav } from "@/components/app/nav-links";
import { Notice } from "@/components/app/notice";
import { Wordmark } from "@/components/app/wordmark";
import { formatDateTime } from "@/lib/format";
import { bannerFor, getSyncStatus } from "@/lib/mana/status";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const banner = bannerFor(await getSyncStatus(db, user.studioId), new Date());
  const showSettings = can(user.role, "settings", "manage");

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#innehall"
        className="label-caps sr-only z-50 rounded-md bg-tegen-light-green px-4 py-2 text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("app.skip")}
      </a>
      <header className="sticky top-0 z-30 bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:h-16">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-tegen-light-green"
          >
            <Wordmark />
          </Link>
          <TopNav showSettings={showSettings} />
          <div className="flex items-center gap-3">
            <span className="hidden max-w-40 truncate text-sm text-white/70 lg:inline">{user.name}</span>
            <form action={signOut}>
              <button
                type="submit"
                aria-label={t("nav.signOut")}
                className="label-caps inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-tegen-light-green"
              >
                <LogOut aria-hidden="true" className="size-5" />
                <span className="hidden sm:inline">{t("nav.signOut")}</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="innehall" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 focus:outline-none md:pt-8 md:pb-12">
        {banner && (
          <Notice
            tone={banner.tone === "red" ? "danger" : banner.tone === "amber" ? "warning" : "info"}
            className="mb-5"
          >
            {banner.kind === "failed" && t("mana.banner.failed", { error: banner.error })}
            {banner.kind === "never" && t("mana.banner.never")}
            {banner.kind === "stale" && t("mana.banner.stale", { when: formatDateTime(banner.since) })}
            {banner.kind === "running" &&
              (banner.total === null
                ? t("mana.banner.runningNoTotal", { done: String(banner.done) })
                : t("mana.banner.running", { done: String(banner.done), total: String(banner.total) }))}
          </Notice>
        )}
        {children}
      </main>

      <BottomNav showSettings={showSettings} />
    </div>
  );
}
