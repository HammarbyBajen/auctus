"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/**
 * A button for something that cannot be undone. The first press only arms it
 * ("Bekräfta: ta bort"), the second within a few seconds does it. It disarms by
 * itself, so a stray tap never deletes anything.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  ...props
}: React.ComponentProps<typeof Button> & { confirmLabel: string }) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      type="submit"
      {...props}
      variant={armed ? "destructive" : props.variant}
      disabled={pending || props.disabled}
      aria-live="polite"
      onClick={(event) => {
        if (!armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
    >
      {pending ? t("app.saving") : armed ? confirmLabel : children}
    </Button>
  );
}
