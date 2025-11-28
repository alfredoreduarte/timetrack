# Build stage
FROM node:18-alpine AS build

# Accept build arguments
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY packages/ui/package*.json ./packages/ui/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build shared package first
RUN npm run build:shared

# Build the React application for web (not Electron)
WORKDIR /app/packages/ui
RUN npm run build:react

# Development stage - run Vite dev server
FROM node:18-alpine AS development

# Accept build arguments
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY packages/ui/package*.json ./packages/ui/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build shared package first
RUN npm run build:shared

# Expose Vite dev server port
EXPOSE 5173

# Change to UI directory and start dev server
WORKDIR /app/packages/ui
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built React app to nginx html directory
COPY --from=build /app/packages/ui/dist/renderer/ /usr/share/nginx/html/

# Copy nginx configuration
COPY packages/ui/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]