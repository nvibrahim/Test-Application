# syntax=docker/dockerfile:1.7
# One image, five roles: web | api | worker | migrate | cli (see entrypoint.sh).
# Build from the repository root:  docker build -f infra/docker/Dockerfile -t inspower:dev .

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- deps: install every workspace with the lockfile ----------
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/config-typescript/package.json packages/config-typescript/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------- build: shared -> api -> web ----------
FROM deps AS build
ARG VERSION=dev
ARG API_INTERNAL_URL=http://api:4000
ENV APP_VERSION=${VERSION} API_INTERNAL_URL=${API_INTERNAL_URL} NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @inspower/shared build \
 && pnpm --filter @inspower/api db:generate \
 && pnpm --filter @inspower/api build \
 && pnpm --filter @inspower/web build
# Production node_modules for the API only (the web app is standalone)
RUN pnpm --filter @inspower/api --prod deploy --legacy /out/api

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
ARG VERSION=dev
ENV NODE_ENV=production APP_VERSION=${VERSION} NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg tini \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system app && useradd --system --gid app --home /app app
WORKDIR /app

# API, worker, CLI and Prisma CLI (for `migrate`)
COPY --from=build --chown=app:app /out/api/node_modules ./api/node_modules
COPY --from=build --chown=app:app /app/apps/api/dist ./api/dist
COPY --from=build --chown=app:app /app/apps/api/prisma ./api/prisma
COPY --from=build --chown=app:app /app/apps/api/prisma.config.ts ./api/prisma.config.ts
COPY --from=build --chown=app:app /app/apps/api/package.json ./api/package.json
COPY --from=build --chown=app:app /app/packages/shared/dist ./api/node_modules/@inspower/shared/dist
COPY --from=build --chown=app:app /app/packages/shared/package.json ./api/node_modules/@inspower/shared/package.json

# Web app (Next.js standalone output)
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./web
COPY --from=build --chown=app:app /app/apps/web/.next/static ./web/apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./web/apps/web/public

COPY --chown=app:app infra/docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && mkdir -p /storage /backups && chown app:app /storage /backups
USER app
EXPOSE 3000 4000
ENTRYPOINT ["tini", "--", "/app/entrypoint.sh"]
CMD ["api"]
