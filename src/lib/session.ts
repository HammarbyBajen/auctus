import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { can, type Resource } from "./permissions";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Any signed-in user, otherwise back to the login page. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

/** A signed-in user who may perform an action, otherwise back home with a notice. */
export async function requirePermission(resource: Resource, action: string) {
  const user = await requireUser();
  if (!can(user.role, resource, action)) redirect("/?fel=behorighet");
  return user;
}
