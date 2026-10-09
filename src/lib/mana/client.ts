import "server-only";
import {
  parseContract,
  usersPageSchema,
  userMembershipsSchema,
  type UserMembershipsPage,
  paymentsPageSchema,
  type PaymentsPage,
} from "./contracts";
import { ManaError } from "./errors";

export type ManaClientOptions = {
  baseUrl: string;
  studioId: string;
  apiKey: string;
  /** Mana allows about one request per second per gym. Keep clear of that. */
  minIntervalMs?: number;
  maxRetries?: number;
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
 *   when Mana sends it). Other errors are not retried.
 * - Errors never contain the key or a response body.
 */
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
  requestCount = 0;

  constructor(options: ManaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.studioId = options.studioId;
    this.apiKey = options.apiKey;
    this.minIntervalMs = options.minIntervalMs ?? 1100;
    this.maxRetries = options.maxRetries ?? 5;
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
          try {
            return await response.json();
          } catch {
            throw new ManaError("contract", "Mana svarade med något som inte är JSON.", {
              status: response.status,
            });
          }
        }
        const requestId = response.headers.get("x-request-id") ?? undefined;
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
        if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
          await this.sleep(Math.min(retryAfter, 60) * 1000);
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
