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

# Bring in full monorepo source and build the SSR landing site (client + server bundles)
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

EXPOSE 8080
WORKDIR /app/packages/landing
CMD ["npm", "run", "dev:ssr"]

###############################
# Production stage
###############################
FROM node:18-alpine AS production

WORKDIR /app

COPY --from=build /app/packages/landing/dist ./dist

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "dist/server/server.js"]