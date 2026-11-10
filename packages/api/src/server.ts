import { createApp } from "./app";
import { logger } from "./utils/logger";
import { prisma } from "./utils/database";

const { httpServer, io } = createApp();

const PORT = process.env.PORT || 3011;

const shutdown = (signal: string) => async () => {
  logger.info(`${signal} received, shutting down gracefully`);
  await prisma.$disconnect();
  httpServer.close(() => {
    logger.info("Process terminated");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown("SIGTERM"));
process.on("SIGINT", shutdown("SIGINT"));

httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(
    `📚 API Documentation available at http://localhost:${PORT}/api-docs`
  );
  logger.info(`🏥 Health check available at http://localhost:${PORT}/health`);
});

export { io };
