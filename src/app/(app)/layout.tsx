import { cookies } from "next/headers";
import Link from "next/link";
import { LogOut, Plus } from "lucide-react";
import { signOut } from "@/app/actions";
import { db } from "@/db";
import { Button, ButtonLink } from "@/components/ui/button";
import { Mark } from "@/components/app/mark";
import { BottomNav, SideNav } from "@/components/app/nav-links";
import { Notice } from "@/components/app/notice";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { formatDateTime } from "@/lib/format";
import { getApiWatchStatus } from "@/lib/mana/api-watch-service";
import { bannerFor, getSyncStatus } from "@/lib/mana/status";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { parseTheme, themeCookie } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const showSettings = can(user.role, "settings", "manage");
  const showSalary = can(user.role, "salary", "read");
  // Side by side, not one after the other: every page waits for these.
  // Owners hear about changes to Mana's API (ticket 24) until one marks them checked.
  const [sync, api, cookieStore] = await Promise.all([getSyncStatus(db, user.studioId), showSettings ? getApiWatchStatus(db) : null, cookies()]);
  const banner = bannerFor(sync, new Date());
  const apiNotice =
    api && api.pending.length > 0
      ? { tone: api.pending.some((p) => p.changes.touchesSync) ? ("danger" as const) : ("warning" as const), text: api.pending.some((p) => p.changes.touchesSync) ? t("mana.api.noticeSync") : t("mana.api.notice") }
      : api?.lastCheck && !api.lastCheck.ok
        ? { tone: "warning" as const, text: t("mana.api.noticeFailed", { error: api.lastCheck.error ?? "" }) }
        : null;
  const theme = parseTheme(cookieStore.get(themeCookie)?.value);

  const signOutButton = (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="icon" aria-label={t("nav.signOut")} title={t("nav.signOut")}>
        <LogOut aria-hidden="true" />
      </Button>
    </form>
  );

  return (
    <div className="min-h-dvh bg-rail lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#innehall"
        className="focus-ring sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("app.skip")}
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 bg-sidebar px-3 py-4 lg:flex">
        <div className="px-2">
          <Mark />
        </div>
        <ButtonLink href="/leads/ny" className="justify-start">
          <Plus aria-hidden="true" />
          {t("leads.new")}
        </ButtonLink>
        <SideNav showSettings={showSettings} showSalary={showSalary} />
        <div className="mt-auto flex items-center justify-between gap-2 px-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{user.name}</span>
          <div className="flex items-center">
            <ThemeToggle initial={theme} />
            {signOutButton}
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col bg-background lg:my-2 lg:mr-2 lg:min-h-[calc(100dvh-1rem)] lg:rounded-2xl lg:elevation-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 bg-sidebar px-4 pt-[env(safe-area-inset-top)] elevation-2 lg:hidden">
          <Mark />
          <div className="flex items-center">
            <ThemeToggle initial={theme} />
            {signOutButton}
          </div>
        </header>

        <main id="innehall" tabIndex={-1} className="flex-1 pb-24 lg:pb-0">
          {banner && (
            <div className="px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
              <Notice tone={banner.tone === "red" ? "danger" : banner.tone === "amber" ? "warning" : "info"}>
                {banner.kind === "failed" && t("mana.banner.failed", { error: banner.error })}
                {banner.kind === "never" && t("mana.banner.never")}
                {banner.kind === "stale" && t("mana.banner.stale", { when: formatDateTime(banner.since) })}
                {banner.kind === "running" &&
                  (banner.total === null
                    ? t("mana.banner.runningNoTotal", { done: String(banner.done) })
                    : t("mana.banner.running", { done: String(banner.done), total: String(banner.total) }))}
              </Notice>
            </div>
          )}
          {apiNotice && (
            <div className="px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
              <Notice tone={apiNotice.tone}>
                {apiNotice.text}{" "}
                <Link href="/installningar/mana#api" className="focus-ring rounded-xs font-medium underline underline-offset-4">
                  {t("mana.api.view")}
                </Link>
              </Notice>
            </div>
          )}
          {children}
        </main>
      </div>

      <BottomNav showSettings={showSettings} showSalary={showSalary} />
    </div>
  );
}
