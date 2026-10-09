import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ac, roles } from "./permissions";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // Nobody can create their own account: owners add users (ticket 14).
    disableSignUp: true,
    minPasswordLength: 10,
  },
  session: {
    // Signed cookie cache: most getSession() calls skip the database.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Counters live in the database so limits hold across serverless instances.
  rateLimit: { enabled: true, storage: "database" },
  user: {
    additionalFields: {
      studioId: { type: "string", required: true, input: false },
    },
  },
  plugins: [
    admin({ ac, roles, defaultRole: "staff", adminRoles: ["owner"] }),
    nextCookies(),
  ],
});
