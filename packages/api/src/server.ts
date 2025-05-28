import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./utils/logger";
import { prisma } from "./utils/database";

// Import routes
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import projectRoutes from "./routes/projects";
import taskRoutes from "./routes/tasks";
import timeEntryRoutes from "./routes/timeEntries";
import reportRoutes from "./routes/reports";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS configuration for development - allow frontend origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:3001",
  "http://localhost:5173", // Vite dev server (Electron frontend)
  "http://localhost:3001", // Alternative frontend port
];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TimeTrack API",
      version: "1.0.0",
      description: "A comprehensive time tracking API similar to Toggl",
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts"], // Path to the API docs
};

const specs = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(helmet());

// Enhanced CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // In development, allow all origins for easier testing
        if (process.env.NODE_ENV === "development") {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      }
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  })
);

// Rate limiting - more lenient for development
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes default
  max: parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS ||
      process.env.NODE_ENV === "development"
      ? "1000"
      : "100"
  ), // 1000 for dev, 100 for prod
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: Math.ceil(
      parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000") / 1000
    ),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in development if DISABLE_RATE_LIMIT is set
  skip: (req) => {
    return (
      process.env.NODE_ENV === "development" &&
      process.env.DISABLE_RATE_LIMIT === "true"
    );
  },
});

// Only apply rate limiting if not disabled
if (
  process.env.DISABLE_RATE_LIMIT !== "true" ||
  process.env.NODE_ENV === "production"
) {
  app.use(limiter);
  logger.info(
    `Rate limiting enabled: ${
      process.env.NODE_ENV === "development" ? "1000" : "100"
    } requests per 15 minutes`
  );
} else {
  logger.info("Rate limiting disabled for development");
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/time-entries", timeEntryRoutes);
app.use("/api/reports", reportRoutes);

// Socket.IO for real-time updates
io.on("connection", (socket) => {
  logger.info(`User connected: ${socket.id}`);

  socket.on("join-user-room", (userId: string) => {
    socket.join(`user-${userId}`);
    logger.info(`User ${userId} joined their room`);
  });

  socket.on("disconnect", () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});

// Make io available to routes
app.set("io", io);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: `The requested route ${req.originalUrl} does not exist.`,
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await prisma.$disconnect();
  httpServer.close(() => {
    logger.info("Process terminated");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await prisma.$disconnect();
  httpServer.close(() => {
    logger.info("Process terminated");
    process.exit(0);
  });
});

// Start server
httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(
    `📚 API Documentation available at http://localhost:${PORT}/api-docs`
  );
  logger.info(`🏥 Health check available at http://localhost:${PORT}/health`);
});

export { io };
