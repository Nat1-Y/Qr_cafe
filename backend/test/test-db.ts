// The only database the tests may touch. Override with TEST_DATABASE_URL, but
// the name must start with "qr_e2e" so a real database can never be used.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:test@localhost:5433/qr_e2e";

export function assertTestDatabase(url: string): { adminUrl: string; name: string } {
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  if (!/^qr_e2e[a-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to run tests against "${name}": the test database name must start with qr_e2e.`);
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  return { adminUrl: admin.toString(), name };
}
