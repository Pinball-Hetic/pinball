FROM oven/bun:1.2-alpine AS base

WORKDIR /app

# On copie TOUT le monorepo (sauf node_modules via .dockerignore) 
# pour garantir que les Workspaces Bun sont reconnus
COPY . .

# Installation avec bun
RUN bun install

# Build du serveur
RUN bun run --filter @pinball/server build

EXPOSE 3001

# Lancement direct avec bun
CMD ["bun", "packages/server/src/interface/index.ts"]
