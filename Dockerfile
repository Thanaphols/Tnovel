FROM node:22-alpine AS base
# Prisma's engine needs OpenSSL on Alpine
RUN apk add --no-cache openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# eslint-config-next 16 wants eslint 9 while the repo pins eslint 8 (lint only); do not block the build on it
RUN npm ci --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# Runtime image store (lib/imageStore); docker-compose mounts a volume here so images survive redeploys
RUN mkdir -p /app/storage/images && chown -R nextjs:nodejs /app/storage
# SQLite database (docker-compose mounts a volume here)
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
# Chromium for scraping sites that need a real browser (lib/scraper.ts looks for it)
RUN apk add --no-cache chromium

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/.next ./.next

USER nextjs

EXPOSE 9000

ENV PORT=9000
ENV HOST="0.0.0.0"

# Create/upgrade the SQLite schema on every start (no migrations folder; schema is db push based).
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
