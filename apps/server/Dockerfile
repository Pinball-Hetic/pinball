FROM oven/bun:1.2-alpine AS base

WORKDIR /app

# Aligné sur l'image app : certains outils attendent la CLI npm pendant install/build
RUN apk add --no-cache npm

# On copie TOUT le monorepo (sauf node_modules via .dockerignore) 
# pour garantir que les Workspaces Bun sont reconnus
COPY . .

# Installation avec bun
RUN bun install

# Génération du client Prisma (le serveur importe @prisma/client)
RUN bun run --filter @pinball/server prisma:generate

# Build du serveur
RUN bun run --filter @pinball/server build

# Entrypoint : applique les migrations Prisma avant de lancer le CMD
RUN chmod +x /app/apps/server/docker-entrypoint.sh

EXPOSE 3001

# ENTRYPOINT s'exécute toujours (même si le compose dev override le CMD) →
# migrations appliquées dans les deux environnements.
ENTRYPOINT ["/app/apps/server/docker-entrypoint.sh"]
CMD ["bun", "apps/server/src/interface/index.ts"]
