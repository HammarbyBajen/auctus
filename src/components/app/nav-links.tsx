"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Item = { href: string; label: string; icon: typeof Home; primary?: boolean };

function items(showSettings: boolean): Item[] {
  return [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/leads", label: t("nav.leads"), icon: Users },
    { href: "/leads/ny", label: t("nav.newLeadShort"), icon: Plus, primary: true },
    ...(showSettings ? [{ href: "/installningar", label: t("nav.settings"), icon: Settings }] : []),
  ];
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/leads") return pathname === "/leads" || (pathname.startsWith("/leads/") && pathname !== "/leads/ny");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigation in the top bar, from tablet width up. */
export function TopNav({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label={t("nav.main")} className="hidden items-center gap-1 md:flex">
      {items(showSettings).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "label-caps rounded-md px-3 py-2 text-base text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-tegen-light-green",
              active && "bg-white/10 text-white",
              item.primary && "ml-2 bg-tegen-light-green text-primary hover:bg-[#bfe0bb] hover:text-primary",
            )}
          >
            {item.primary && <Plus aria-hidden="true" className="mr-1 inline size-4 align-[-2px]" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Tab bar along the bottom on phones, within reach of the thumb. */
export function BottomNav({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-primary pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items(showSettings).map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-white/70 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-tegen-light-green",
                  active && "text-white",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full",
                    item.primary && "bg-tegen-light-green text-primary",
                    active && !item.primary && "bg-white/10",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="label-caps text-[11px] tracking-normal">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
