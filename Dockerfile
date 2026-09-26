# syntax=docker/dockerfile:1

# --- Build: install deps, typecheck and build the static app ---
FROM node:22-alpine AS build
WORKDIR /app

# pnpm version comes from "packageManager" in package.json.
RUN corepack enable

# Dependencies first, so this layer is cached until the lockfile changes.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
 && node docker/nginx-headers.mjs > /app/security-headers.conf

# --- Runtime: static files behind nginx, as a non-root user ---
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
