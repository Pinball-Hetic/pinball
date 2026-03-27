FROM oven/bun:1.2-alpine AS base

WORKDIR /app

# On copie TOUT le monorepo
COPY . .

# Installation avec bun
RUN bun install

# Build de l'app Next.js
RUN bun run --filter @pinball/app build

EXPOSE 3000

# Start via bun
CMD ["bun", "run", "--filter", "@pinball/app", "start"]
