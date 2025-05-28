const { PrismaClient } = require("@prisma/client");
import { logger } from "./logger";

declare global {
  var __prisma: any | undefined;
}

// Prevent multiple instances of Prisma Client in development
const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: [
      {
        emit: "event",
        level: "query",
      },
      {
        emit: "event",
        level: "error",
      },
      {
        emit: "event",
        level: "info",
      },
      {
        emit: "event",
        level: "warn",
      },
    ],
  });

// Log database queries in development
if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (e: any) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Params: ${e.params}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

prisma.$on("error", (e: any) => {
  logger.error("Database error:", e);
});

prisma.$on("info", (e: any) => {
  logger.info("Database info:", e.message);
});

prisma.$on("warn", (e: any) => {
  logger.warn("Database warning:", e.message);
});

if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

export { prisma };
