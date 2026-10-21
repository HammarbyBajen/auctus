import Link from "next/link";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** Alla or Mina (mine and nobody's), as links, so the choice lives in the address. */
export function ScopeToggle({ scope, href, label }: { scope: "all" | "mine"; href: (scope: "all" | "mine") => string; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-md bg-well p-1">
      {(["all", "mine"] as const).map((value) => (
        <Link
          key={value}
          href={href(value)}
          aria-current={scope === value ? "page" : undefined}
          className={cn(
            "focus-ring inline-flex min-h-9 items-center rounded-sm px-3 text-sm transition-[background-color]",
            scope === value ? "bg-card font-medium elevation-1" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {value === "all" ? t("home.scopeAll") : t("home.scopeMine")}
        </Link>
      ))}
    </nav>
  );
}
