import Link from "next/link";
import { BookOpen, Bot, ChevronRight, Clock, Inbox, Mail, ListOrdered, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Page } from "@/components/app/page";
import { Surface } from "@/components/app/surface";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function SettingsPage() {
  await requirePermission("settings", "manage");
  return (
    <Page title={t("settings.title")} description={t("settings.intro")} className="max-w-3xl">
      <Surface as="div" className="divide-y divide-border overflow-hidden">
        <Link
          href="/installningar/intag"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <Inbox aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.intake")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
        <Link
          href="/installningar/pipeline"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <ListOrdered aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.pipeline")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
        <Link
          href="/installningar/anvandare"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <Users aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.users")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
        <Link
          href="/installningar/tider"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <Clock aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.times")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
        <Link
          href="/installningar/epost"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <Mail aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.email")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
        <Link
          href="/installningar/assistent"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <Bot aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.assistant")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
        <Link
          href="/installningar/handbok"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <BookOpen aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.handbook")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
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
        <Link
          href="/installningar/integritet"
          className="focus-ring flex min-h-14 items-center gap-3 px-4 transition-[background-color] hover:bg-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-well text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{t("settings.privacy")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
      </Surface>
    </Page>
  );
}
