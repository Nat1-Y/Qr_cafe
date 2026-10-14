import { execSync } from "child_process";
import { Client } from "pg";
import { TEST_DATABASE_URL, assertTestDatabase } from "./test-db";

// Fresh database per run, built from the current Drizzle schema (the numbered
// migration chain can't build an empty DB — see the M1 notes). Migration 0017
// itself is verified separately against a copy of the pre-change schema.
export default async function globalSetup() {
  const { adminUrl, name } = assertTestDatabase(TEST_DATABASE_URL);
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  execSync("npx drizzle-kit push --force", {
    cwd: __dirname + "/..",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "ignore",
  });
}
