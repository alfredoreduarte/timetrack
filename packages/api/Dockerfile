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

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci
COPY . .
RUN npm run build:shared
RUN npm run build:api
CMD ["npm", "run", "dev:api"]

# Production build stage
FROM base AS build
COPY . .
RUN npm ci
RUN npm run build:shared
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
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=build --chown=nodeuser:nodejs /app/packages/api/dist ./packages/api/dist
COPY --from=build --chown=nodeuser:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nodeuser:nodejs /app/packages/api/prisma ./packages/api/prisma
COPY --from=build --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
  echo 'set -e' >> /app/start.sh && \
  echo 'echo "Starting TimeTrack API..."' >> /app/start.sh && \
  echo 'cd /app/packages/api' >> /app/start.sh && \
  echo 'echo "Generating Prisma client..."' >> /app/start.sh && \
  echo 'npx prisma generate' >> /app/start.sh && \
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