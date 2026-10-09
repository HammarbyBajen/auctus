import Link from "next/link";
import { signOut } from "@/app/actions";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ fel?: string }>;
}) {
  const user = await requireUser();
  const { fel } = await searchParams;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("home.greeting", { name: user.name })}</h1>
        <form action={signOut}>
          <button className="rounded-lg border border-stone-300 px-4 py-2">{t("nav.signOut")}</button>
        </form>
      </header>
      {fel === "behorighet" && (
        <p role="alert" className="rounded-lg bg-amber-100 px-4 py-3">
          {t("home.noAccess")}
        </p>
      )}
      <p className="text-lg text-stone-700">{t("home.empty")}</p>
      {can(user.role, "settings", "manage") && (
        <Link href="/installningar" className="text-lg underline">
          {t("nav.settings")}
        </Link>
      )}
    </main>
  );
}
