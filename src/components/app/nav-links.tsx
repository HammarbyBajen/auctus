"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, Clock, HeartHandshake, Home, Settings, Users } from "lucide-react";
import { press, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** `phone: false` keeps an item out of the bottom bar, which has room for five; it stays in the sidebar. */
type Item = { href: string; label: string; icon: typeof Home; phone?: false };

function items(showSettings: boolean, showSalary: boolean): Item[] {
  return [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/leads", label: t("nav.leads"), icon: Users },
    { href: "/medlemmar", label: t("nav.members"), icon: HeartHandshake },
    // On a phone the report is reached from the Leads page.
    { href: "/rapport", label: t("nav.report"), icon: BarChart3, phone: false },
    ...(showSalary ? [{ href: "/timmar", label: t("nav.salary"), icon: Clock }] : []),
    ...(showSettings ? [{ href: "/installningar", label: t("nav.settings"), icon: Settings }] : []),
  ];
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const MotionLink = motion.create(Link);

/** The sidebar navigation, from large screens up. */
export function SideNav({ showSettings, showSalary }: { showSettings: boolean; showSalary: boolean }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  return (
    <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
      {items(showSettings, showSalary).map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <MotionLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            whileTap={reduce ? undefined : press}
            transition={springs.snappy}
            className={cn(
              "focus-ring flex h-9 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground transition-[background-color] hover:bg-sidebar-accent",
              active && "bg-sidebar-accent font-medium",
            )}
          >
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            {item.label}
          </MotionLink>
        );
      })}
    </nav>
  );
}

/** The tab bar along the bottom on phones and tablets, within reach of the thumb. */
export function BottomNav({ showSettings, showSalary }: { showSettings: boolean; showSalary: boolean }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  // Ny lead is on the Leads page; the bar has room for five.
  const all = items(showSettings, showSalary).filter((item) => item.phone !== false);
  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed inset-x-0 bottom-0 z-40 bg-sidebar pb-[env(safe-area-inset-bottom)] elevation-2 lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {all.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <MotionLink
                href={item.href}
                aria-current={active ? "page" : undefined}
                whileTap={reduce ? undefined : press}
                transition={springs.snappy}
                className={cn(
                  "focus-ring flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-2xs text-muted-foreground",
                  active && "font-medium text-sidebar-foreground",
                )}
              >
                <span className={cn("flex size-8 items-center justify-center rounded-md", active && "bg-sidebar-accent")}>
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                {item.label}
              </MotionLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
