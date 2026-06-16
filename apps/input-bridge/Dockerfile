# Étape build : Bun résout les workspaces et bundle le service en un seul JS.
FROM oven/bun:1.2-alpine AS build
WORKDIR /app
COPY . .
RUN bun install
# --target=node : le bundle tourne sous Node (voir runtime ci-dessous).
RUN bun build apps/input-bridge/src/index.ts --target=node --outfile /tmp/bridge.js

# Étape runtime : Node, PAS Bun. Bun 1.2 ne supporte pas uv_default_loop appelé
# par les addons natifs de `ws` (bufferutil/utf-8-validate) → SIGILL crash-loop
# sur la borne. Node supporte libuv nativement. Lecture série via node:fs +
# busybox `stty` (présent dans node:alpine). Bundle self-contained, pas de
# node_modules : les requires natifs optionnels de ws retombent sur le JS pur.
FROM node:20-alpine
WORKDIR /app
COPY --from=build /tmp/bridge.js ./bridge.js
CMD ["node", "bridge.js"]
