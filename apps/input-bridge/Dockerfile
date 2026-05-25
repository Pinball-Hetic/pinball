FROM oven/bun:1.2-alpine AS base

WORKDIR /app

# Bindings natifs serialport (compilés au moment de bun install)
RUN apk add --no-cache python3 make g++ linux-headers

# Copie tout le monorepo pour que les workspaces Bun résolvent correctement
COPY . .

RUN bun install

CMD ["bun", "run", "--filter", "@pinball/input-bridge", "start"]
