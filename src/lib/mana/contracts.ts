import { z } from "zod";
import { ManaError } from "./errors";

/**
 * What the CRM relies on in Mana's responses. Mana's API is in alpha, so each
 * response is checked against these shapes, and a change fails loudly with the
 * path of the field that moved, instead of quietly storing wrong data.
 * Extra fields Mana adds are ignored.
 */
const nullableString = z.string().nullable();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "expected a date");

const links = z.object({ next: z.string().nullable() });
const meta = z.object({ totalCount: z.number().nullable() });

export const usersPageSchema = z.object({
  data: z.object({
    items: z.array(
      z.object({
        userId: z.string().min(1),
        role: z.enum(["member", "staff", "admin", "owner"]),
        profile: z.object({
          name: nullableString,
          email: nullableString,
          phone: nullableString,
        }),
      }),
    ),
  }),
  links,
  meta,
});
export type UsersPage = z.infer<typeof usersPageSchema>;

const pendingChange = z
  .object({
    kind: z.enum(["cancel", "freeze"]),
    endDate: dateString.optional(),
    freezeDate: dateString.optional(),
  })
  .nullable();

export const userMembershipsSchema = z.object({
  data: z.object({
    items: z.array(
      z.object({
        id: z.string().min(1),
        membershipId: z.string().min(1),
        name: z.string(),
        type: z.enum(["standard", "credits"]),
        status: z.enum(["active", "ended", "future"]),
        startDate: dateString,
        pendingChange,
        commitmentEndDate: dateString.nullable(),
        cancelEffectiveDate: dateString.nullable(),
        price: z.object({ amount: z.number().int(), currency: z.string() }),
      }),
    ),
  }),
  links,
  meta,
});
export type UserMembershipsPage = z.infer<typeof userMembershipsSchema>;

/** Checks a response against a contract. The error names the field that is wrong, never its value. */
export function parseContract<T>(schema: z.ZodType<T>, body: unknown, what: string): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const problems = result.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  throw new ManaError("contract", `Mana svarade på ett oväntat sätt (${what}). Fält: ${problems}`);
}
