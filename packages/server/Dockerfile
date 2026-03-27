FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/config-lint ./packages/config-lint

RUN npm install --ignore-engines

COPY packages/server ./packages/server

RUN npm run build -w @pinball/server

EXPOSE 3001

CMD ["node", "packages/server/dist/interface/index.js"]
