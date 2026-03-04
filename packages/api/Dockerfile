# Use Node.js 18 LTS Alpine for smaller image size
FROM node:18-alpine AS base

# Install dependencies needed for native modules, curl for healthcheck, and OpenSSL for Prisma
RUN apk add --no-cache libc6-compat curl openssl

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies (cache mount survives across builds for fast reinstalls)
RUN --mount=type=cache,target=/root/.npm npm ci --only=production

# Development stage
FROM base AS development
# Install all dependencies (including dev dependencies) for development
RUN --mount=type=cache,target=/root/.npm ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
COPY . .
# Build shared package first
RUN npm run build:shared
# Generate Prisma client
RUN cd packages/api && npx prisma generate
# Set working directory to API package for development
WORKDIR /app/packages/api
# Use the development script that includes migrations
CMD ["npm", "run", "dev:docker"]

# Production build stage
FROM base AS build
COPY . .
RUN --mount=type=cache,target=/root/.npm ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
RUN npm run build:shared
RUN cd packages/api && npx prisma generate
RUN npm run build:api

# Production stage
FROM node:18-alpine AS production

# Install curl for healthcheck and OpenSSL for Prisma
RUN apk add --no-cache curl openssl

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001

WORKDIR /app

# Copy package files
COPY --from=build /app/package*.json ./
COPY --from=build /app/packages/api/package*.json ./packages/api/
COPY --from=build /app/packages/shared/package*.json ./packages/shared/

# Install only production dependencies
RUN --mount=type=cache,target=/root/.npm npm ci --only=production

# Copy built application and generated Prisma client
COPY --from=build --chown=nodeuser:nodejs /app/packages/api/dist ./packages/api/dist
COPY --from=build --chown=nodeuser:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nodeuser:nodejs /app/packages/api/prisma ./packages/api/prisma
COPY --from=build --chown=nodeuser:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nodeuser:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Create startup script (Prisma client is pre-generated during build)
RUN echo '#!/bin/sh' > /app/start.sh && \
  echo 'set -e' >> /app/start.sh && \
  echo 'echo "Starting TimeTrack API..."' >> /app/start.sh && \
  echo 'cd /app/packages/api' >> /app/start.sh && \
  echo 'echo "Running database migrations..."' >> /app/start.sh && \
  echo 'npx prisma migrate deploy' >> /app/start.sh && \
  echo 'echo "Starting server..."' >> /app/start.sh && \
  echo 'cd /app' >> /app/start.sh && \
  echo 'exec node packages/api/dist/server.js' >> /app/start.sh && \
  chmod +x /app/start.sh && \
  chown nodeuser:nodejs /app/start.sh

# Create logs directory
RUN mkdir -p /app/logs && chown nodeuser:nodejs /app/logs

# Switch to non-root user
USER nodeuser

# Expose port (will be set by environment variable, defaults to 3011)
EXPOSE ${PORT:-3011}

# Health check (use environment variable for port)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3011}/health || exit 1

# Start the application with the startup script
CMD ["/app/start.sh"]