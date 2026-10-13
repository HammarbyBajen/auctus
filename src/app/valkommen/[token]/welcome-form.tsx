"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { choosePassword, type WelcomeState } from "./actions";

export function WelcomeForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(choosePassword.bind(null, token), {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {/* Lets a password manager save the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("welcome.password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="password-hint" />
        <p id="password-hint" className="text-xs text-muted-foreground">
          {t("welcome.hint")}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="repeat">{t("welcome.repeat")}</Label>
        <Input id="repeat" name="repeat" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(state.error)}
        </p>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? t("app.saving") : t("welcome.submit")}
      </Button>
    </form>
  );
}
