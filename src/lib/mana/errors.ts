/**
 * Errors from the Mana client. Messages are written to be safe to store and
 * show: they never contain the API key, a response body or personal data.
 */
export class ManaError extends Error {
  constructor(
    public code: "auth" | "rate_limited" | "api" | "network" | "contract" | "not_configured",
    message: string,
    public details: { status?: number; apiCode?: string; requestId?: string } = {},
  ) {
    super(message);
    this.name = "ManaError";
  }
}

/** The short text that ends up on the sync status page. */
export function describeManaError(error: unknown): string {
  if (error instanceof ManaError) return error.message;
  return "Okänt fel i synken";
}
