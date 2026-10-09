"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error: result } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (result) {
      setError(result.status === 429 ? "tooMany" : "credentials");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-lg">
        {t("login.email")}
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-stone-300 px-3 py-3 text-lg"
        />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        {t("login.password")}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-stone-300 px-3 py-3 text-lg"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error === "tooMany" ? t("login.tooMany") : t("login.error")}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-stone-900 px-4 py-3 text-lg font-medium text-white disabled:opacity-60"
      >
        {t("login.submit")}
      </button>
    </form>
  );
}
