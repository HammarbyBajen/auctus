import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { accountState } from "@/lib/users/service";
import { auth } from "./auth";
import { can, type Resource } from "./permissions";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Any signed-in user, otherwise back to the login page. A switched-off account
 * is turned away too, on its very next page load, and a changed role applies
 * at once: the session cookie is cached for a few minutes, so this one small
 * lookup is what makes both immediate.
 * Once per request: the layout and the page both ask, and share the answer.
 */
export const requireUser = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  const account = await accountState(db, session.user.id);
  if (account.switchedOff) redirect("/login?avstangd=1");
  return { ...session.user, role: account.role };
});

/** A signed-in user who may perform an action, otherwise back home with a notice. */
export async function requirePermission(resource: Resource, action: string) {
  const user = await requireUser();
  if (!can(user.role, resource, action)) redirect("/?fel=behorighet");
  return user;
}
