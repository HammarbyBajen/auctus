"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/** A submit button that shows "Sparar…" and cannot be pressed twice while the form is being sent. */
export function SubmitButton({
  children,
  pendingLabel,
  keepLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string; keepLabel?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled} aria-busy={pending || undefined}>
      {pending && !keepLabel ? (pendingLabel ?? t("app.saving")) : children}
    </Button>
  );
}
