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

if (!/test/i.test(new URL(process.env.DATABASE_URL).pathname)) {
  // Tests TRUNCATE every table. Refuse to point them at anything that
  // doesn't look like a dedicated test database.
  throw new Error(
    `Refusing to run tests against non-test database: ${process.env.DATABASE_URL}`
  );
}
