"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { themeCookie, type ThemeChoice } from "@/lib/theme";
import { t } from "@/lib/i18n";

const order: ThemeChoice[] = ["system", "light", "dark"];

/** Cycles system, light and dark. The choice is kept for a year. */
export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;

  function next() {
    const value = order[(order.indexOf(choice) + 1) % order.length];
    setChoice(value);
    document.cookie =
      value === "system"
        ? `${themeCookie}=; path=/; max-age=0; samesite=lax`
        : `${themeCookie}=${value}; path=/; max-age=31536000; samesite=lax`;
    const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }

  const label = t(choice === "light" ? "theme.light" : choice === "dark" ? "theme.dark" : "theme.system");
  return (
    <Button variant="ghost" size="icon" onClick={next} aria-label={`${t("theme.label")}: ${label}`} title={label}>
      <Icon aria-hidden="true" />
    </Button>
  );
}
