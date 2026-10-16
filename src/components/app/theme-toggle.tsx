"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { themeCookie, type ThemeChoice } from "@/lib/theme";
import { t, type MessageKey } from "@/lib/i18n";

const options: { value: ThemeChoice; icon: typeof Sun; label: MessageKey }[] = [
  { value: "light", icon: Sun, label: "theme.light" },
  { value: "dark", icon: Moon, label: "theme.dark" },
  { value: "system", icon: Monitor, label: "theme.system" },
];

/**
 * Picks light, dark or the device's setting from a menu, so the choice is
 * made directly rather than by guessing where a cycle goes next. The icon
 * shows the current choice. It is kept for a year.
 */
export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const current = options.find((o) => o.value === choice) ?? options[2];

  function choose(value: ThemeChoice) {
    setChoice(value);
    document.cookie =
      value === "system"
        ? `${themeCookie}=; path=/; max-age=0; samesite=lax`
        : `${themeCookie}=${value}; path=/; max-age=31536000; samesite=lax`;
    const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        className={buttonVariants({ variant: "ghost", size: "icon" })}
        aria-label={`${t("theme.label")}: ${t(current.label)}`}
        title={t("theme.label")}
      >
        <current.icon aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="end" sideOffset={6} className="z-50">
          <Menu.Popup className="min-w-44 origin-(--transform-origin) rounded-xl bg-popover p-1 text-popover-foreground elevation-3 transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Menu.RadioGroup value={choice} onValueChange={(value: ThemeChoice) => choose(value)}>
              {options.map(({ value, icon: Icon, label }) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  closeOnClick
                  className="focus-ring flex min-h-11 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm select-none data-highlighted:bg-accent sm:min-h-9"
                >
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span className="flex-1">{t(label)}</span>
                  <Menu.RadioItemIndicator>
                    <Check aria-hidden="true" className="size-4" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
