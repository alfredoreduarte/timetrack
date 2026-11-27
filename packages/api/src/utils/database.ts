import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "./logger";

const makeClient = () =>
  new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "info" },
      { emit: "event", level: "warn" },
    ],
  });

type AppPrismaClient = ReturnType<typeof makeClient>;

/** Client handed to `$transaction(async (tx) => ...)` callbacks. */
export type TxClient = Prisma.TransactionClient;

declare global {
  var __prisma: AppPrismaClient | undefined;
}

// Prevent multiple instances of Prisma Client in development
const prisma: AppPrismaClient = globalThis.__prisma || makeClient();

// Log database queries in development
if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (e) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Params: ${e.params}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

prisma.$on("error", (e) => {
  logger.error("Database error:", e);
});

prisma.$on("info", (e) => {
  logger.info("Database info:", e.message);
});

prisma.$on("warn", (e) => {
  logger.warn("Database warning:", e.message);
});

if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

export { prisma };
