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

/**
 * A stretch of a membership's price (ticket 26): the ordinary price, a
 * discount, another price, or a freeze (disableMembership). Lenient on
 * purpose: Mana marks some as "unknown", and a missing field must not stop
 * the sync.
 */
const pricePeriod = z.object({
  fromDate: dateString.nullish(),
  toDate: dateString.nullish(),
  price: z.object({ amount: z.number().int(), currency: z.string() }).nullish(),
  type: z.string(),
  discountPercent: z.number().nullish(),
  disableMembership: z.boolean().nullish(),
});

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
        pricePeriods: z.array(pricePeriod).nullish(),
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

export const paymentsPageSchema = z.object({
  data: z.object({
    items: z.array(
      z.object({
        id: z.string().min(1),
        user: z.object({ id: z.string().min(1) }).nullable(),
        paidAt: z.string().nullable(),
        status: z.string(),
        kind: z.string(),
        description: z.string().nullable(),
      }),
    ),
  }),
  links,
  meta,
});
export type PaymentsPage = z.infer<typeof paymentsPageSchema>;

/** Class bookings at the studio (ticket 13): who, which class start, and how it went. */
export const classBookingsPageSchema = z.object({
  data: z.object({
    items: z.array(
      z.object({
        id: z.string().min(1),
        userId: z.string().min(1),
        startsAt: z.string().min(1),
        status: z.string(),
      }),
    ),
  }),
  links,
  meta,
});
export type ClassBookingsPage = z.infer<typeof classBookingsPageSchema>;

/** Gym check-ins at the studio (ticket 13): who came in, and when. */
export const gymCheckInsPageSchema = z.object({
  data: z.object({
    items: z.array(
      z.object({
        id: z.string().min(1),
        createdAt: z.string().min(1),
        user: z.object({ id: z.string().min(1) }),
      }),
    ),
  }),
  links,
  meta,
});
export type GymCheckInsPage = z.infer<typeof gymCheckInsPageSchema>;

// ---- Salary (WFM) module (ticket 20): coach work, read only ----

const maybeLinks = z.object({ next: z.string().nullable() }).optional();

export const instructorsPageSchema = z.object({
  data: z.object({ items: z.array(z.object({ id: z.string().min(1), name: z.string() })) }),
  links: maybeLinks,
});
export type InstructorsPage = z.infer<typeof instructorsPageSchema>;

export const classEventsSchema = z.object({
  data: z.object({
    items: z.array(
      z.object({
        id: z.string().min(1),
        class: z.object({ id: z.string().min(1), title: z.string() }),
        startsAt: z.string().min(1),
        endsAt: z.string().min(1),
        instructorId: z.string().nullable(),
        /** A class hidden from members' schedule, such as Tegenbutik (only with includeHidden). */
        isHidden: z.boolean().optional(),
      }),
    ),
  }),
  links: maybeLinks,
});
export type ClassEventsPage = z.infer<typeof classEventsSchema>;

export const serviceBookingsPageSchema = z.object({
  data: z.object({
    items: z.array(
      z.object({
        id: z.string().min(1),
        specialistServiceId: z.string().min(1),
        instructorId: z.string().nullable(),
        startsAt: z.string().min(1),
        endsAt: z.string().min(1),
        status: z.string(),
      }),
    ),
  }),
  links: maybeLinks,
});
export type ServiceBookingsPage = z.infer<typeof serviceBookingsPageSchema>;

export const namedListSchema = z.object({
  data: z.object({ items: z.array(z.object({ id: z.string().min(1), name: z.string() })) }),
  links: maybeLinks,
});
export type NamedList = z.infer<typeof namedListSchema>;

export const courseEventsSchema = z.object({
  data: z.object({
    items: z.array(z.object({ id: z.string().min(1), startsAt: z.string().min(1), endsAt: z.string().min(1), instructorId: z.string().nullable() })),
  }),
  links: maybeLinks,
});
export type CourseEventsPage = z.infer<typeof courseEventsSchema>;

// ---- Klippkort (ticket 31) ----

/** The studio's class credit bundles: Klippkort, Day Pass and the like. */
export const creditBundlesSchema = z.object({
  data: z.object({ items: z.array(z.object({ id: z.string().min(1), name: z.string(), credits: z.number() })) }),
  links: maybeLinks,
});
export type CreditBundlesPage = z.infer<typeof creditBundlesSchema>;

/** One person's class credits, one pool per kind, with when they expire. */
export const classCreditsSchema = z.object({
  data: z.object({
    items: z.array(z.object({ credits: z.number(), type: z.string(), expireDate: dateString.nullish() })),
  }),
  links: maybeLinks,
});
export type ClassCreditsPage = z.infer<typeof classCreditsSchema>;
