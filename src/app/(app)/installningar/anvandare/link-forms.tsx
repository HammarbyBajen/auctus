"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Link2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/app/native-select";
import { t } from "@/lib/i18n";
import { addUserAction, newLinkAction, type LinkState } from "./actions";

/** A personal link, ready to copy and send. Shown once; it is not stored anywhere readable. */
function LinkResult({ link, name }: { link: string; name?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="flex flex-col gap-2 rounded-md bg-well p-3">
      <p className="text-sm font-medium">{t("users.linkReady", { name: name ?? "" })}</p>
      <div className="flex gap-2">
        <Input value={link} readOnly aria-label={t("users.linkLabel")} className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t("users.copied") : t("users.copy")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("users.linkHint")}</p>
    </div>
  );
}

export function AddUserForm() {
  const [state, action, pending] = useActionState<LinkState, FormData>(addUserAction, {});
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-name">{t("users.name")}</Label>
          <Input id="new-name" name="name" required autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-email">{t("users.email")}</Label>
          <Input id="new-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-role">{t("users.role")}</Label>
          <NativeSelect id="new-role" name="role" defaultValue="staff">
            <option value="staff">{t("role.staff")}</option>
            <option value="owner">{t("role.owner")}</option>
          </NativeSelect>
        </div>
        <Button type="submit" disabled={pending}>
          <UserPlus aria-hidden="true" />
          {pending ? t("app.saving") : t("users.add")}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(state.error)}
        </p>
      )}
      {state.link && <LinkResult link={state.link} name={state.name} />}
    </div>
  );
}

export function NewLinkForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(newLinkAction.bind(null, userId, name), {});
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <Button type="submit" size="sm" variant="ghost" disabled={pending}>
          <Link2 aria-hidden="true" />
          {t("users.newLink")}
        </Button>
      </form>
      {state.link && <LinkResult link={state.link} name={state.name} />}
    </div>
  );
}
