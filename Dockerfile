FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# Install dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json turbo.json ./
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile || pnpm install

# Build all packages
RUN pnpm turbo build

# ─── Server target ──────────────────────────────────────────────────
FROM node:20-alpine AS server
WORKDIR /app
COPY --from=base /app /app
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]

# ─── Dashboard target ──────────────────────────────────────────────
FROM node:20-alpine AS dashboard
WORKDIR /app
COPY --from=base /app/packages/dashboard/.next/standalone ./
COPY --from=base /app/packages/dashboard/.next/static ./.next/static
COPY --from=base /app/packages/dashboard/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

# ─── Worker target ──────────────────────────────────────────────────
FROM node:20-alpine AS worker
WORKDIR /app
COPY --from=base /app /app
CMD ["node", "packages/server/dist/worker.js"]
