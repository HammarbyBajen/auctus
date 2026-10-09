import { config } from "dotenv";

// Local runs read .env.local. In CI the variables come from the workflow.
config({ path: ".env.local", quiet: true });
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
