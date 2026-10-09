"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/app/notice";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/i18n";

/**
 * Signs in through the HTTP auth endpoint (not a server action) so Better Auth's
 * rate limiting applies to password guesses.
 */
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<"credentials" | "tooMany" | null>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error: result } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (result) {
      setPending(false);
      setError(result.status === 429 ? "tooMany" : "credentials");
      emailRef.current?.focus();
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate={false}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">
          {t("login.email")}
        </Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="none"
          placeholder={t("login.emailPlaceholder")}
          required
          aria-invalid={error === "credentials" || undefined}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">
          {t("login.password")}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error === "credentials" || undefined}
        />
      </div>
      {error && <Notice tone="danger">{error === "tooMany" ? t("login.tooMany") : t("login.error")}</Notice>}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("login.signingIn") : t("login.submit")}
      </Button>
    </form>
  );
}
