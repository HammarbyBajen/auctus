import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function SettingsPage() {
  await requirePermission("settings", "manage");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <p className="text-lg text-stone-700">{t("settings.intro")}</p>
      <Link href="/installningar/mana" className="text-lg underline">
        {t("settings.mana")}
      </Link>
    </main>
  );
}
