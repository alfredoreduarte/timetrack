// Loaded before every test file (jest `setupFiles`). Points Prisma at the
// throwaway test database and pins deterministic secrets.
// Defaults to the docker-compose dev Postgres; override with TEST_DATABASE_URL.
const DEFAULT_TEST_DB = `postgresql://timetrack_user:${
  process.env.POSTGRES_PASSWORD || "timetrack_secure_password"
}@localhost:3012/timetrack_test`;

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DB;
process.env.JWT_SECRET = "test-jwt-secret";
process.env.NODE_ENV = "test";
process.env.DISABLE_RATE_LIMIT = "true";
// Billing turns on from the environment alone; suites opt in explicitly
// (see enableBilling() in billing.test.ts) so a developer's exported keys
// can't change every other test's plan.
for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_YEARLY"]) {
  delete process.env[key];
}

const dbUrl = new URL(process.env.DATABASE_URL);
if (!/test/i.test(dbUrl.pathname)) {
  // Tests TRUNCATE every table. Refuse to point them at anything that
  // doesn't look like a dedicated test database. (Host + db only — never
  // print credentials.)
  throw new Error(
    `Refusing to run tests against non-test database: ${dbUrl.host}${dbUrl.pathname}`
  );
}
