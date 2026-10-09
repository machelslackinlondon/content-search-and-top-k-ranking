FROM node:24.21.0-alpine3.23 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.test.json jest.config.cjs ./
COPY src ./src
COPY tests ./tests

RUN npm run typecheck \
  && npm test -- --runInBand \
  && npm run build

FROM node:24.21.0-alpine3.23 AS runtime

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]
