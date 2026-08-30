# ---- build ----
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/

ENV NODE_ENV=development
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate \
  && npm run build \
  && find src/generated/prisma -name '*.node' -exec cp -t dist/generated/prisma/ {} +

# ---- runtime ----
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# dotenv is imported at runtime but lives in devDependencies
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 5000

USER node

CMD ["node", "dist/index.js"]
