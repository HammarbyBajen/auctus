import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/app/chip";
import { NativeSelect } from "@/components/app/native-select";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { requirePermission } from "@/lib/session";
import { listUsers, type StudioUser } from "@/lib/users/service";
import { t } from "@/lib/i18n";
import { setActiveAction, setRoleAction } from "./actions";
import { AddUserForm, NewLinkForm } from "./link-forms";

export const dynamic = "force-dynamic";

/** Who can sign in, and as what (ticket 14). Owners only. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ sparat?: string; avstangd?: string; aktiverad?: string }> }) {
  const owner = await requirePermission("users", "manage");
  const { sparat, avstangd, aktiverad } = await searchParams;
  const users = await listUsers(db, owner.studioId);

  return (
    <Page
      title={t("users.title")}
      description={t("users.intro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("users.saved")}</Notice>}
      {avstangd === "1" && <Notice tone="success">{t("users.switchedOff")}</Notice>}
      {aktiverad === "1" && <Notice tone="success">{t("users.switchedOn")}</Notice>}

      <Panel title={t("users.addTitle")} id="add">
        <AddUserForm />
      </Panel>

      <Panel title={t("users.listTitle")} id="list">
        <ul className="flex flex-col divide-y divide-border">
          {users.map((u) => (
            <UserRow key={u.id} user={u} self={u.id === owner.id} />
          ))}
        </ul>
      </Panel>
    </Page>
  );
}

function UserRow({ user, self }: { user: StudioUser; self: boolean }) {
  const status = !user.active ? "off" : user.hasPassword ? null : user.linkPending ? "waiting" : "noLink";
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className={user.active ? undefined : "text-muted-foreground"}>{user.name}</span>
            {self && <Chip>{t("users.you")}</Chip>}
            {status === "off" && <Chip tone="destructive">{t("users.statusOff")}</Chip>}
            {status === "waiting" && <Chip tone="warning">{t("users.statusWaiting")}</Chip>}
            {status === "noLink" && <Chip tone="warning">{t("users.statusNoLink")}</Chip>}
          </p>
          <p className="text-xs break-all text-muted-foreground">{user.email}</p>
        </div>
        {self ? (
          <p className="text-sm text-muted-foreground">{user.role ? t(`role.${user.role}`) : ""}</p>
        ) : (
          <form action={setRoleAction.bind(null, user.id)} className="flex items-center gap-2">
            <NativeSelect name="role" defaultValue={user.role ?? "staff"} aria-label={t("users.roleFor", { name: user.name })} className="h-9 w-auto sm:h-8">
              <option value="staff">{t("role.staff")}</option>
              <option value="owner">{t("role.owner")}</option>
            </NativeSelect>
            <SubmitButton size="sm" variant="outline">
              {t("users.saveRole")}
            </SubmitButton>
          </form>
        )}
      </div>
      {!self && (
        <div className="flex flex-wrap items-start gap-2">
          {user.active && <NewLinkForm userId={user.id} name={user.name} />}
          <form action={setActiveAction.bind(null, user.id, !user.active)}>
            <SubmitButton size="sm" variant={user.active ? "ghost" : "outline"}>
              {user.active ? t("users.switchOff") : t("users.switchOn")}
            </SubmitButton>
          </form>
        </div>
      )}
    </li>
  );
}
