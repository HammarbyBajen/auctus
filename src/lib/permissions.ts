import { createAccessControl } from "better-auth/plugins/access";

/**
 * Fixed roles for v1 (see docs/adr/0003-fixed-roles.md). Owners can do everything,
 * staff work with leads and tasks but cannot open settings or manage users.
 * Further resources (leads, tasks, salary) are added as those features are built.
 */
export const statement = {
  settings: ["manage"],
  users: ["manage"],
  leads: ["read", "write"],
  salary: ["read"],
  /** Paying members and monthly revenue on the home page. */
  kpi: ["read"],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  settings: ["manage"],
  users: ["manage"],
  leads: ["read", "write"],
  salary: ["read"],
  kpi: ["read"],
});

export const staff = ac.newRole({
  leads: ["read", "write"],
});

export const roles = { owner, staff };

export type Role = keyof typeof roles;
export type Resource = keyof typeof statement;

export function isRole(value: string | null | undefined): value is Role {
  return value === "owner" || value === "staff";
}

/** Pure permission check, used by the server guards and tested directly. */
export function can(
  role: string | null | undefined,
  resource: Resource,
  action: string,
): boolean {
  if (!isRole(role)) return false;
  const allowed = (roles[role].statements as Record<string, readonly string[] | undefined>)[resource];
  return Boolean(allowed?.includes(action));
}
