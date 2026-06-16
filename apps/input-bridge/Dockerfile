FROM oven/bun:1.2-alpine AS base

WORKDIR /app

# Plus de binding natif : la lecture série passe par node:fs + busybox `stty`
# (présent dans l'image alpine). Aucun toolchain de compilation requis.

# Copie tout le monorepo pour que les workspaces Bun résolvent correctement
COPY . .

RUN bun install

CMD ["bun", "run", "--filter", "@pinball/input-bridge", "start"]
