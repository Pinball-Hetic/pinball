FROM oven/bun:1.2-alpine AS base

WORKDIR /app

# Next.js peut appeler `npm` (ex. patch SWC) pendant le build ; l'image Bun Alpine ne l'inclut pas
RUN apk add --no-cache npm

# On copie TOUT le monorepo
COPY . .

# Installation avec bun
RUN bun install

# NEXT_PUBLIC_* est inliné au BUILD par `next build` (prod) → doit être un
# build-arg, pas un environment runtime. Défaut "direct" = comportement actuel.
ARG NEXT_PUBLIC_KEYBOARD_MODE=direct
ENV NEXT_PUBLIC_KEYBOARD_MODE=$NEXT_PUBLIC_KEYBOARD_MODE

# Build de l'app Next.js
RUN bun run --filter @pinball/playfield build

EXPOSE 3000

# Start via bun
CMD ["bun", "run", "--filter", "@pinball/playfield", "start"]
