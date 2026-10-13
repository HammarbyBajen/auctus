import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: it checks that a session cookie exists. The real
 * check happens on the server in every page (see lib/session.ts).
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // The workflow paths belong to Vercel Workflow and must not be intercepted.
  // The welcome page is where a new user chooses a password, so they have no session yet.
  matcher: ["/((?!login|valkommen|api|_next/static|_next/image|favicon.ico|\\.well-known/workflow/).*)"],
};
