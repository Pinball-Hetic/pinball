FROM oven/bun:1.2-alpine AS base

WORKDIR /app

RUN apk add --no-cache npm

COPY . .

RUN bun install

RUN bun run --filter @pinball/dmd build

EXPOSE 3000

CMD ["bun", "run", "--filter", "@pinball/dmd", "start"]
