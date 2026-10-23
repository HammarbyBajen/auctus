"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Menu } from "@base-ui/react/menu";
import { BarChart3, BookOpen, Clock, HeartHandshake, Home, MoreHorizontal, Settings, Users } from "lucide-react";
import { press, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** `more: true` puts an item under Mer in the bottom bar on phones; the sidebar shows every item. */
type Item = { href: string; label: string; icon: typeof Home; more?: true };

function items(showSettings: boolean, showSalary: boolean): Item[] {
  return [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/leads", label: t("nav.leads"), icon: Users },
    { href: "/medlemmar", label: t("nav.members"), icon: HeartHandshake },
    { href: "/handbok", label: t("nav.handbook"), icon: BookOpen, more: true },
    { href: "/rapport", label: t("nav.report"), icon: BarChart3, more: true },
    ...(showSalary ? [{ href: "/timmar", label: t("nav.salary"), icon: Clock, more: true as const }] : []),
    ...(showSettings ? [{ href: "/installningar", label: t("nav.settings"), icon: Settings, more: true as const }] : []),
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
  // Ny lead is on the Leads page; the rest of the modules are under Mer.
  const all = items(showSettings, showSalary);
  const bar = all.filter((item) => !item.more);
  const more = all.filter((item) => item.more);
  const moreActive = more.some((item) => isActive(pathname, item.href));
  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed inset-x-0 bottom-0 z-40 bg-sidebar pb-[env(safe-area-inset-bottom)] elevation-2 lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {bar.map((item) => {
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
        {more.length > 0 && (
          <li className="flex-1">
            <Menu.Root>
              <Menu.Trigger
                className={cn(
                  "focus-ring flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-2xs text-muted-foreground",
                  moreActive && "font-medium text-sidebar-foreground",
                )}
              >
                <span className={cn("flex size-8 items-center justify-center rounded-md", moreActive && "bg-sidebar-accent")}>
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </span>
                {t("nav.more")}
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="top" align="end" sideOffset={8} className="z-50">
                  <Menu.Popup className="min-w-52 origin-(--transform-origin) rounded-xl bg-popover p-1 text-popover-foreground elevation-3 transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                    {more.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(pathname, item.href);
                      return (
                        <Menu.LinkItem
                          key={item.href}
                          render={<Link href={item.href} />}
                          closeOnClick
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "focus-ring flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm select-none data-highlighted:bg-accent",
                            active && "font-medium",
                          )}
                        >
                          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                          {item.label}
                        </Menu.LinkItem>
                      );
                    })}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </li>
        )}
      </ul>
    </nav>
  );
}
