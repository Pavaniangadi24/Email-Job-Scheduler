FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY . .
RUN npm run db:generate -w @scheduler/api && npm run build -w @scheduler/api
FROM build AS migrate
CMD ["npm", "run", "db:migrate", "-w", "@scheduler/api"]
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /app /app
RUN npm prune --omit=dev && rm -rf node_modules/prisma node_modules/@prisma/config node_modules/@prisma/engines node_modules/deepmerge-ts
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@scheduler/api"]