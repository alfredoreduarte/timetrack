import { execSync } from "child_process";
import path from "path";

// Apply all migrations to the test database once per run.
export default async function globalSetup() {
  require("./env");
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../.."),
    env: process.env,
    stdio: "pipe",
  });
}
