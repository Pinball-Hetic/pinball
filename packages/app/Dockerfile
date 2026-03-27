FROM oven/bun:1.2-alpine AS base

WORKDIR /app

# Next.js peut appeler `npm` (ex. patch SWC) pendant le build ; l'image Bun Alpine ne l'inclut pas
RUN apk add --no-cache npm

# On copie TOUT le monorepo
COPY . .

# Installation avec bun
RUN bun install

# Build de l'app Next.js
RUN bun run --filter @pinball/app build

EXPOSE 3000

# Start via bun
CMD ["bun", "run", "--filter", "@pinball/app", "start"]
