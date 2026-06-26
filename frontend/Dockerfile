# Base image for installing dependencies
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies
RUN npm install

# Stage for building the Next.js application
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry during builds
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js app
RUN npm run build

# Stage for running the Next.js application in production
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root system user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built artifacts and assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

# Port configuration (Cloud Run uses PORT environment variable)
EXPOSE 3000
ENV PORT=3000

# Start Next.js server
CMD ["npm", "run", "start"]
