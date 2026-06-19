FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
COPY prisma ./prisma
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=postgresql://postgres:postgres@postgres:5432/3205-test?schema=public
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379

COPY package.json yarn.lock ./
COPY prisma ./prisma
RUN yarn install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
