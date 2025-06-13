###############################
# Build stage
###############################
FROM node:18-alpine AS build

# Accept optional public path
ARG PUBLIC_URL
ENV PUBLIC_URL=${PUBLIC_URL:-/}

WORKDIR /app

# Copy workspace package manifests so npm can resolve deps
COPY package*.json ./
COPY packages/landing/package*.json ./packages/landing/
COPY packages/shared/package*.json ./packages/shared/

RUN npm ci

# Bring in full monorepo source and build the landing site
COPY . .
RUN npm run build --workspace=timetrack-landing

###############################
# Development stage
###############################
FROM node:18-alpine AS development

WORKDIR /app

COPY package*.json ./
COPY packages/landing/package*.json ./packages/landing/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci

COPY . .

EXPOSE 5174
WORKDIR /app/packages/landing
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5174"]

###############################
# Production stage
###############################
FROM nginx:alpine AS production

RUN apk add --no-cache curl

COPY --from=build /app/packages/landing/dist/ /usr/share/nginx/html/
COPY packages/landing/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]