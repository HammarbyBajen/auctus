"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { checkLeadInMana } from "../actions";

/** Asks the server to look this lead up in Mana once the page has shown, and reloads the page only if something changed. */
export function ManaRefresher({ leadId }: { leadId: string }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    checkLeadInMana(leadId).then(({ changed }) => {
      if (changed && !cancelled) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [leadId, router]);
  return null;
}
