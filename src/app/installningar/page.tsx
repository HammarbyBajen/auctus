import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function SettingsPage() {
  await requirePermission("settings", "manage");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <p className="text-lg text-stone-700">{t("settings.intro")}</p>
      <Link href="/" className="text-lg underline">
        {t("nav.home")}
      </Link>
    </main>
  );
}
