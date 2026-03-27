FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/app/package.json ./packages/app/
COPY packages/game-engine ./packages/game-engine
COPY packages/config-lint ./packages/config-lint

RUN npm install --ignore-engines

COPY packages/app ./packages/app

RUN npm run build -w @pinball/app

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@pinball/app"]
