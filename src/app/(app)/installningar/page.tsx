import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Page } from "@/components/app/page";
import { Surface } from "@/components/app/surface";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function SettingsPage() {
  await requirePermission("settings", "manage");
  return (
    <Page title={t("settings.title")} description={t("settings.intro")} className="max-w-3xl">
      <Surface as="div" className="overflow-hidden">
        <Link
          href="/installningar/mana"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <RefreshCw aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.mana")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
      </Surface>
    </Page>
  );
}
