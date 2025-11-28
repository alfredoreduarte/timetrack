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
import { sanitizeInputs } from "./middleware/sanitization";
import { logger } from "./utils/logger";
import { prisma } from "./utils/database";
import jwt from "jsonwebtoken";

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
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [
      "http://localhost:3010", // Web UI port
      "http://localhost:5173", // Vite dev server (Electron frontend)
      "http://localhost:3011", // API port for direct access
      "file://", // Electron apps
    ];

// Log allowed origins for debugging
logger.info("Allowed CORS origins:", allowedOrigins);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3011;

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
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          // Allow swagger UI scripts (only in development)
          ...(process.env.NODE_ENV === "development"
            ? [
                "'unsafe-inline'", // For swagger UI
                "'unsafe-eval'", // For swagger UI
                "cdn.jsdelivr.net",
                "unpkg.com",
              ]
            : []),
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // For swagger UI styling
          "cdn.jsdelivr.net",
          "fonts.googleapis.com",
        ],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        connectSrc: [
          "'self'",
          // Add allowed domains from environment
          ...(process.env.CSP_ALLOWED_DOMAINS
            ? process.env.CSP_ALLOWED_DOMAINS.split(",").map((domain) =>
                domain.trim()
              )
            : []),
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'none'"],
        childSrc: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
      reportOnly: process.env.CSP_REPORT_ONLY === "true", // Configurable via environment
    },
    crossOriginEmbedderPolicy: process.env.NODE_ENV === "production",
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  })
);

// Enhanced CORS configuration
app.use(
  cors({
    origin: function (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) {
      // Allow requests with no origin (like mobile apps, Electron apps, or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      // Allow file:// protocol (Electron apps)
      if (origin.startsWith("file://")) {
        logger.info(`Allowing Electron app origin: ${origin}`);
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.warn(
          `Origin ${origin} not in allowed list: ${JSON.stringify(
            allowedOrigins
          )}`
        );
        // In development, allow all origins for easier testing
        if (process.env.NODE_ENV === "development") {
          logger.info("Allowing origin in development mode");
          callback(null, true);
        } else {
          logger.error(`CORS blocked origin: ${origin}`);
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

// Request size limiting and upload protection
const requestSizeLimiter = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Different size limits based on endpoint - configurable via environment variables
  let sizeLimit = process.env.REQUEST_SIZE_DEFAULT || "1mb"; // Default limit

  // Auth endpoints - smaller limit since they only need basic user data
  if (req.path.startsWith("/auth/")) {
    sizeLimit = process.env.REQUEST_SIZE_AUTH || "50kb";
  }
  // Time entries and reports might need slightly more space
  else if (
    req.path.startsWith("/time-entries/") ||
    req.path.startsWith("/reports/")
  ) {
    sizeLimit = process.env.REQUEST_SIZE_TIME_ENTRIES || "500kb";
  }
  // Projects and tasks - moderate limit
  else if (
    req.path.startsWith("/projects/") ||
    req.path.startsWith("/tasks/")
  ) {
    sizeLimit = process.env.REQUEST_SIZE_PROJECTS || "200kb";
  }
  // User profile updates
  else if (req.path.startsWith("/users/")) {
    sizeLimit = process.env.REQUEST_SIZE_USERS || "100kb";
  }

  // Apply the size limit to the current request
  express.json({
    limit: sizeLimit,
    verify: (req: any, res, buf) => {
      // Additional validation - check for suspicious content
      if (buf.length > 0) {
        const content = buf.toString();

        // Detect potential JSON bombs or deeply nested objects
        const depth = (content.match(/\{|\[/g) || []).length;
        if (depth > 20) {
          const error = new Error("Request structure too complex");
          (error as any).statusCode = 413;
          throw error;
        }

        // Detect extremely long strings that might be attack vectors
        const longStringPattern = /"[^"]{10000,}"/;
        if (longStringPattern.test(content)) {
          const error = new Error("Individual field too large");
          (error as any).statusCode = 413;
          throw error;
        }
      }
    },
  })(req, res, (err: any) => {
    if (err) {
      if (err.type === "entity.too.large") {
        logger.warn(
          `Request too large from ${req.ip}: ${req.path}, size: ${req.get(
            "content-length"
          )}`
        );
        return res.status(413).json({
          error: "Request entity too large",
          message: `Request size exceeds the limit of ${sizeLimit}`,
          maxSize: sizeLimit,
        });
      }
      if (err.statusCode === 413) {
        logger.warn(`Suspicious request structure from ${req.ip}: ${req.path}`);
        return res.status(413).json({
          error: "Request structure invalid",
          message: err.message,
        });
      }
      return next(err);
    }
    next();
  });
};

// Apply request size limiting
app.use(requestSizeLimiter);

// URL-encoded data limiting with similar protections
app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.REQUEST_SIZE_URLENCODED || "1mb",
    parameterLimit: 1000, // Limit number of parameters
    verify: (req: any, res, buf) => {
      // Check for parameter pollution attempts
      if (buf.length > 0) {
        const content = buf.toString();
        const paramCount = (content.match(/&/g) || []).length + 1;
        if (paramCount > 100) {
          const error = new Error("Too many parameters");
          (error as any).statusCode = 413;
          throw error;
        }
      }
    },
  })
);

// Raw body size limiting for any other content types
app.use(express.raw({ limit: process.env.REQUEST_SIZE_RAW || "1mb" }));
app.use(express.text({ limit: process.env.REQUEST_SIZE_TEXT || "100kb" }));

// Middleware to log large requests for monitoring
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const contentLength = parseInt(req.get("content-length") || "0");

    // Log requests larger than 100KB for monitoring
    if (contentLength > 100000) {
      logger.info({
        type: "large_request",
        ip: req.ip,
        path: req.path,
        method: req.method,
        contentLength,
        userAgent: req.get("User-Agent"),
        timestamp: new Date().toISOString(),
      });
    }

    next();
  }
);

// Input sanitization middleware - applied after body parsing but before routes
app.use(sanitizeInputs);

// Log XSS protection status
logger.info({
  type: "xss_protection_enabled",
  csp_report_only: process.env.CSP_REPORT_ONLY === "true",
  aggressive_sanitization:
    process.env.ENABLE_AGGRESSIVE_XSS_PROTECTION === "true",
  allowed_csp_domains: process.env.CSP_ALLOWED_DOMAINS || "default",
  timestamp: new Date().toISOString(),
});

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
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/projects", projectRoutes);
app.use("/tasks", taskRoutes);
app.use("/time-entries", timeEntryRoutes);
app.use("/reports", reportRoutes);

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      logger.warn(`Socket connection rejected: No token provided`);
      return next(new Error("Authentication required"));
    }

    if (!process.env.JWT_SECRET) {
      logger.error("JWT_SECRET not configured for socket auth");
      return next(new Error("Server configuration error"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      userId: string;
      email: string;
    };

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      logger.warn(`Socket connection rejected: User not found for token`);
      return next(new Error("User not found"));
    }

    // Attach user data to socket for later use
    (socket as any).user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn(`Socket connection rejected: Invalid token`);
      return next(new Error("Invalid token"));
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn(`Socket connection rejected: Token expired`);
      return next(new Error("Token expired"));
    }
    logger.error(`Socket auth error: ${error}`);
    return next(new Error("Authentication failed"));
  }
});

// Socket.IO for real-time updates
io.on("connection", (socket) => {
  const user = (socket as any).user;
  logger.info(`User connected: ${socket.id} (userId: ${user.id})`);

  // Automatically join user to their room on authenticated connection
  socket.join(`user-${user.id}`);
  logger.info(`User ${user.id} auto-joined their room`);

  // Keep legacy event for backwards compatibility (no-op since already joined)
  socket.on("join-user-room", (userId: string) => {
    // Verify the userId matches the authenticated user
    if (userId !== user.id) {
      logger.warn(
        `User ${user.id} attempted to join room for user ${userId} - denied`
      );
      return;
    }
    // Already joined via auto-join, so this is a no-op
    logger.info(`User ${userId} re-joined their room (already joined)`);
  });

  socket.on("disconnect", () => {
    logger.info(`User disconnected: ${socket.id} (userId: ${user.id})`);
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