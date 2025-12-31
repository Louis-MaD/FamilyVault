# Use Node.js 18 on Alpine 3.19 for consistent OpenSSL 3.0 support
FROM node:18-alpine3.19 AS base

# Install consistent dependencies for all stages
# libc6-compat is needed for some native modules
# openssl is needed for Prisma Client
RUN apk add --no-cache libc6-compat openssl

# Install dependencies only when needed
FROM base AS deps
# Install build tools for native compilation
RUN apk add --no-cache python3 make g++
WORKDIR /app

# Copy dependency files
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
# Install build tools for native modules
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Rebuild native modules for Alpine Linux
RUN npm rebuild argon2

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy rebuilt native modules (argon2)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/argon2 ./node_modules/argon2
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/node-gyp-build ./node_modules/node-gyp-build

# Create data directory with correct permissions
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
