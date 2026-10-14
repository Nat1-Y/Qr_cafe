import { TEST_DATABASE_URL, assertTestDatabase } from "./test-db";

assertTestDatabase(TEST_DATABASE_URL);
// Set before any app module loads: src/db/drizzle.ts reads it at import time,
// and dotenv never overrides a variable that is already set.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = "test-only-secret";
process.env.WEB_ORIGIN = "http://localhost:3000";
