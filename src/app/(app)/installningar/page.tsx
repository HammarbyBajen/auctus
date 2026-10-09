import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function SettingsPage() {
  await requirePermission("settings", "manage");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={t("settings.title")} />
      <p className="text-muted-foreground">{t("settings.intro")}</p>
      <ul className="overflow-hidden rounded-md border border-border bg-card">
        <li>
          <Link
            href="/installningar/mana"
            className="flex min-h-16 items-center gap-4 px-4 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
              <RefreshCw aria-hidden="true" className="size-5" />
            </span>
            <span className="flex-1 text-lg font-medium">{t("settings.mana")}</span>
            <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
          </Link>
        </li>
      </ul>
    </div>
  );
}
