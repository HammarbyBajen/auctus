import Link from "next/link";
import { signOut } from "@/app/actions";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

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
      <div className="flex-1 py-6">{children}</div>
    </div>
  );
}
