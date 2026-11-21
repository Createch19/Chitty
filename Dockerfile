# Chitty production image (Coolify builds this on every push to main).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Kolkata
RUN apk add --no-cache tzdata && addgroup -S chitty && adduser -S chitty -G chitty
COPY --from=build --chown=chitty:chitty /app/.next/standalone ./
COPY --from=build --chown=chitty:chitty /app/.next/static ./.next/static
COPY --from=build --chown=chitty:chitty /app/public ./public
# SQL migrations run automatically on start (src/db/client.ts).
COPY --from=build --chown=chitty:chitty /app/drizzle ./drizzle
USER chitty
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
