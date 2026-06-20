# syntax=docker/dockerfile:1

# ---- Build the static site ----
FROM node:24-slim AS build
WORKDIR /app

# Install against the lockfile for a reproducible build. (This also pulls the
# sprite-pipeline tools in devDependencies; they go unused here and are dropped
# with this stage, so they never reach the final image.)
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Build the Astro static output to /app/dist.
COPY . .
RUN npm run build

# ---- Serve with Caddy ----
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

# The platform (Cloud Run / proxy) sets $PORT; Caddy reads it, defaulting to 8080.
EXPOSE 8080
