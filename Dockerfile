############################################################
# Multi-stage Dockerfile with dependency caching
# - `deps` stage caches `npm ci` layer (invalidated only when
#   package*.json changes)
# - `builder` stage performs the build and prunes dev deps
# - `runner` stage contains only production node_modules + dist
############################################################

ARG NODE_VERSION=20
ARG NODE_ENV=production

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# Install production and dev deps in a separate layer so they are cached
# unless package*.json changes.
COPY package*.json ./
RUN npm ci --silent

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

# copy deps layer to avoid reinstalling when source changes
COPY --from=deps /app/node_modules ./node_modules

# copy the rest of the source and build
COPY . .
RUN npm run build

# Remove devDependencies to keep only production modules
RUN npm prune --production --silent

FROM node:${NODE_VERSION}-alpine AS runner
LABEL org.opencontainers.image.description="stellAIverse backend runtime"
WORKDIR /app

# tiny init to forward signals and reap processes
RUN apk add --no-cache dumb-init

# non-root user for security
RUN addgroup -S app && adduser -S app -G app

# Copy only what's needed for runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=${NODE_ENV}
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

ENTRYPOINT ["dumb-init", "--"]
USER app
CMD ["node", "dist/main"]
