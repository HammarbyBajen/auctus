import "server-only";
import {
  parseContract,
  usersPageSchema,
  userMembershipsSchema,
  type UserMembershipsPage,
  paymentsPageSchema,
  type PaymentsPage,
  classBookingsPageSchema,
  type ClassBookingsPage,
  gymCheckInsPageSchema,
  type GymCheckInsPage,
  instructorsPageSchema,
  classEventsSchema,
  serviceBookingsPageSchema,
  namedListSchema,
  courseEventsSchema,
  creditBundlesSchema,
  classCreditsSchema,
} from "./contracts";
import type { z } from "zod";
import { ManaError } from "./errors";

export type ManaClientOptions = {
  baseUrl: string;
  studioId: string;
  apiKey: string;
  /** Mana allows about one request per second per gym. Keep clear of that. */
  minIntervalMs?: number;
  maxRetries?: number;
  /** Whether the key has already worked in this run, so a later 401 can be Mana's request budget running out. */
  keyWorked?: boolean;
  /** When the last request was made (epoch ms), so spacing holds across separate steps. */
  lastRequestAt?: number | null;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/**
 * A read-only client for one studio's Mana API.
 *
 * - It can only send GET requests: there is no method here that changes
 *   anything in Mana, so the CRM cannot write to it by accident.
 * - Requests are spaced at least `minIntervalMs` apart.
 * - A 429 or a server error is retried with a growing pause (and Retry-After
 *   when Mana sends it, if it is short). A long wait is left to the caller:
 *   the sync pauses for it instead of holding a function open.
 * - Mana gives each key a budget of requests over a time window, and when it
 *   is spent some endpoints answer 401, exactly like a dead key (no
 *   Retry-After). So a 401 after the key has worked in this run is waited out
 *   once and then reported as rate limited, not as a refused key.
 * - Other errors are not retried.
 * - Errors never contain the key or a response body.
 */
/** How long a 401 mid-run is waited out before it counts as the budget running out. */
const budgetWaitMs = 30_000;
/** The longest Retry-After waited out in place. */
const maxRetryAfterS = 15;

export class ManaClient {
  private readonly baseUrl: string;
  private readonly studioId: string;
  private readonly apiKey: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  lastRequestAt: number | null;
  keyWorked: boolean;
  requestCount = 0;

  constructor(options: ManaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.studioId = options.studioId;
    this.apiKey = options.apiKey;
    this.minIntervalMs = options.minIntervalMs ?? 1100;
    this.maxRetries = options.maxRetries ?? 3;
    this.keyWorked = options.keyWorked ?? false;
    this.lastRequestAt = options.lastRequestAt ?? null;
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  private studioUrl(path: string, query: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}/api/v1/studios/${this.studioId}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  }

  private async waitForTurn() {
    if (this.lastRequestAt !== null) {
      const wait = this.lastRequestAt + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
    }
  }

  /** One GET with throttling and retries. Returns the parsed JSON, unchecked. */
  private async getJson(url: string): Promise<unknown> {
    // Only follow links that stay on Mana, so the key can never be sent elsewhere.
    if (new URL(url).origin !== new URL(this.baseUrl).origin) {
      throw new ManaError("contract", "Mana gav en länk till en annan adress, den följdes inte.");
    }
    let attempt = 0;
    let budgetRetried = false;
    for (;;) {
      await this.waitForTurn();
      this.lastRequestAt = this.now();
      this.requestCount += 1;

      let response: Response | null = null;
      try {
        response = await this.fetchFn(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
        });
      } catch {
        // A network failure on a GET is safe to try again.
        if (attempt >= this.maxRetries) throw new ManaError("network", "Kunde inte nå Mana.");
      }

      if (response) {
        if (response.ok) {
          this.keyWorked = true;
          try {
            return await response.json();
          } catch {
            throw new ManaError("contract", "Mana svarade med något som inte är JSON.", {
              status: response.status,
            });
          }
        }
        const requestId = response.headers.get("x-request-id") ?? undefined;
        if (response.status === 401 && this.keyWorked) {
          if (!budgetRetried) {
            budgetRetried = true;
            await this.sleep(budgetWaitMs);
            this.lastRequestAt = null;
            continue;
          }
          throw new ManaError("rate_limited", "Mana nekade nyckeln mitt i synken, troligen för att nyckelns förfrågningar är slut för stunden.", {
            status: response.status,
            requestId,
          });
        }
        if (response.status === 401 || response.status === 403) {
          throw new ManaError("auth", "Mana-nyckeln fungerar inte (nekad åtkomst).", {
            status: response.status,
            requestId,
          });
        }
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) {
          throw new ManaError("api", `Mana svarade med fel ${response.status}.`, {
            status: response.status,
            requestId,
          });
        }
        if (attempt >= this.maxRetries) {
          throw new ManaError(
            response.status === 429 ? "rate_limited" : "api",
            response.status === 429
              ? "Mana säger att vi frågar för ofta (429), även efter väntan."
              : `Mana svarade med fel ${response.status} flera gånger.`,
            { status: response.status, requestId },
          );
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > maxRetryAfterS) {
          // Longer than is worth holding a function open for: the sync pauses instead.
          throw new ManaError("rate_limited", "Mana säger att vi frågar för ofta (429) och ber oss vänta.", {
            status: response.status,
            requestId,
          });
        }
        if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
          await this.sleep(retryAfter * 1000);
          this.lastRequestAt = null;
          attempt += 1;
          continue;
        }
      }
      // Growing pause: 2 s, 4 s, 8 s ... up to 30 s.
      await this.sleep(Math.min(2 ** (attempt + 1), 30) * 1000);
      this.lastRequestAt = null;
      attempt += 1;
    }
  }

  /** One page of people in the studio. Pass the previous page's `next` to continue. */
  async getUsersPage(nextUrl: string | null) {
    const url = nextUrl ?? this.studioUrl("/users", { pageSize: "100", pageIndex: "0" });
    const page = parseContract(usersPageSchema, await this.getJson(url), "personer");
    return {
      items: page.data.items,
      next: page.links.next,
      total: page.meta.totalCount,
    };
  }

  /** People whose name, email or phone contains `term`. Used to look one person up live. */
  async searchUsers(term: string) {
    const url = this.studioUrl("/users", { search: term, pageSize: "20" });
    const page = parseContract(usersPageSchema, await this.getJson(url), "personsökning");
    return page.data.items;
  }

  /** Paid purchases at the studio since `fromAt`, newest first, following every page. */
  async getPaidPayments(fromAt: string) {
    let url: string | null = this.studioUrl("/payment-transactions", {
      status: "paid",
      fromAt,
      pageSize: "100",
    });
    const items: PaymentsPage["data"]["items"] = [];
    while (url) {
      const page: PaymentsPage = parseContract(paymentsPageSchema, await this.getJson(url), "betalningar");
      items.push(...page.data.items);
      url = page.links.next;
    }
    return items;
  }

  /**
   * Every payment at the studio created since `fromAt`, whatever its state
   * (draft, pending, paid, failed...), following every page. A new membership
   * usually makes a draft or pending payment at once, before anything is paid,
   * so this is how a partial sync learns who may have a new membership (ticket 28).
   */
  async getPayments(fromAt: string) {
    let url: string | null = this.studioUrl("/payment-transactions", { fromAt, pageSize: "100" });
    const items: PaymentsPage["data"]["items"] = [];
    while (url) {
      const page: PaymentsPage = parseContract(paymentsPageSchema, await this.getJson(url), "betalningar");
      items.push(...page.data.items);
      url = page.links.next;
    }
    return items;
  }

  /** Class bookings at the studio for classes starting between `fromAt` and `toAt`, following every page (ticket 13). */
  async getClassBookings(fromAt: string, toAt: string) {
    let url: string | null = this.studioUrl("/class-event-bookings", { fromAt, toAt, pageSize: "100" });
    const items: ClassBookingsPage["data"]["items"] = [];
    while (url) {
      const page: ClassBookingsPage = parseContract(classBookingsPageSchema, await this.getJson(url), "bokningar");
      items.push(...page.data.items);
      url = page.links.next;
    }
    return items;
  }

  /** Gym check-ins at the studio between `fromAt` and `toAt`, following every page (ticket 13). */
  async getGymCheckIns(fromAt: string, toAt: string) {
    let url: string | null = this.studioUrl("/gym-check-ins", { fromAt, toAt, pageSize: "200" });
    const items: GymCheckInsPage["data"]["items"] = [];
    while (url) {
      const page: GymCheckInsPage = parseContract(gymCheckInsPageSchema, await this.getJson(url), "incheckningar");
      items.push(...page.data.items);
      url = page.links.next;
    }
    return items;
  }

  /** Every page of a list, following the next link (salary module). */
  private async allPages<T>(first: string, schema: z.ZodType<{ data: { items: T[] }; links?: { next: string | null } }>, what: string): Promise<T[]> {
    let url: string | null = first;
    const items: T[] = [];
    while (url) {
      const page: { data: { items: T[] }; links?: { next: string | null } } = parseContract(schema, await this.getJson(url), what);
      items.push(...page.data.items);
      url = page.links?.next ?? null;
    }
    return items;
  }

  /** The studio's instructors, for linking coaches (ticket 20). */
  async getInstructors() {
    return this.allPages(this.studioUrl("/instructors", { pageSize: "100" }), instructorsPageSchema, "instructörer");
  }

  /**
   * Group classes starting in a window, hidden ones too (Tegenbutik, NSI and the
   * like, which coaches are paid for; ticket 23). Mana refuses windows of more
   * than 200 classes, so callers keep windows short.
   */
  async getClassEvents(fromAt: string, toAt: string) {
    return this.allPages(this.studioUrl("/class-events", { fromAt, toAt, includeHidden: "true" }), classEventsSchema, "pass");
  }

  /** PT and Onramp bookings starting in a window, with their status. */
  async getServiceBookings(fromAt: string, toAt: string) {
    return this.allPages(this.studioUrl("/specialist-service-bookings", { fromAt, toAt, pageSize: "200" }), serviceBookingsPageSchema, "PT-bokningar");
  }

  /** The specialist services (PT30, PT60, Onramp), for their names. */
  async getSpecialistServices() {
    return this.allPages(this.studioUrl("/specialist-services", {}), namedListSchema, "tjänster");
  }

  /** Courses (Tegen Kids) overlapping a window. */
  async getCourses(fromAt: string, toAt: string) {
    return this.allPages(this.studioUrl("/courses", { fromAt, toAt }), namedListSchema, "kurser");
  }

  /** Every session of one course. */
  async getCourseEvents(courseId: string) {
    return this.allPages(this.studioUrl("/course-events", { courseId }), courseEventsSchema, "kurstillfällen");
  }

  /** The studio's class credit bundles (Klippkort, Day Pass...), ticket 31. */
  async getCreditBundles() {
    return this.allPages(this.studioUrl("/class-credit-bundles", {}), creditBundlesSchema, "klippkort");
  }

  /** What one person has left on their class credits, and when it expires (ticket 31). */
  async getClassCredits(manaUserId: string) {
    return this.allPages(this.studioUrl("/class-credits", { userId: manaUserId }), classCreditsSchema, "klipp kvar");
  }

  /** Every membership one person has, past, current and future. */
  async getUserMemberships(manaUserId: string) {
    let url: string | null = this.studioUrl("/user-memberships", {
      userId: manaUserId,
      status: "active,ended,future",
      pageSize: "100",
    });
    const items: UserMembershipsPage["data"]["items"] = [];
    while (url) {
      const page: UserMembershipsPage = parseContract(
        userMembershipsSchema,
        await this.getJson(url),
        "medlemskap",
      );
      items.push(...page.data.items);
      url = page.links.next;
    }
    return items;
  }
}

/**
 * Reads Mana's public OpenAPI spec (for the API change watch, ticket 24). A
 * single GET to a fixed public address, with no key: the spec needs none, so
 * the key is never sent. Not part of ManaClient, since it is not about a studio.
 */
export async function fetchManaSpec(url: string, fetchFn: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ManaError("network", "Kunde inte nå Manas API-beskrivning.");
  }
  if (!response.ok) throw new ManaError("api", `Manas API-beskrivning svarade med fel ${response.status}.`, { status: response.status });
  try {
    return await response.json();
  } catch {
    throw new ManaError("contract", "Manas API-beskrivning var inte JSON.");
  }
}
