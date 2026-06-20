#!/bin/sh
set -e

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "==> Deploy with ${COMPOSE_FILE}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.production.example to .env and configure it."
  exit 1
fi

sed -i 's/\r$//' .env 2>/dev/null || true

if grep -q '^DATABASE_URL=' .env || grep -q '^REDIS_HOST=' .env; then
  echo "ERROR: Remove DATABASE_URL and REDIS_HOST from .env on the server."
  echo "Production .env needs POSTGRES_*, CORS_ORIGIN and DIRECTUS_*."
  exit 1
fi

if ! grep -q '^POSTGRES_PASSWORD=.\+' .env; then
  echo "ERROR: POSTGRES_PASSWORD is missing or empty in .env"
  exit 1
fi

if ! grep -q '^CORS_ORIGIN=.\+' .env; then
  echo "ERROR: CORS_ORIGIN is missing or empty in .env"
  exit 1
fi

for var in DIRECTUS_KEY DIRECTUS_SECRET DIRECTUS_ADMIN_EMAIL DIRECTUS_ADMIN_PASSWORD; do
  if ! grep -q "^${var}=.\\+" .env; then
    echo "ERROR: ${var} is missing or empty in .env"
    exit 1
  fi
done

if [ -f docker-compose.override.yml ]; then
  echo "ERROR: Remove docker-compose.override.yml on the server (it overrides CORS_ORIGIN)."
  exit 1
fi

COMPOSE="docker compose --env-file .env -f ${COMPOSE_FILE}"
POSTGRES_VOLUME="${POSTGRES_VOLUME:-3205_postgres_data_v2}"

if [ "${RESET_DB:-}" = "1" ]; then
  echo "==> RESET_DB=1: removing postgres volume (database will be recreated)"
  ${COMPOSE} down -v --remove-orphans 2>/dev/null || true
  docker rm -f 3205-postgres 3205-backend 3205-redis 3205-directus 2>/dev/null || true
  docker volume rm "${POSTGRES_VOLUME}" 2>/dev/null || true
  docker volume rm url-checker-back_postgres_data_v2 2>/dev/null || true
fi

docker rm -f 3205-postgres 2>/dev/null || true

${COMPOSE} build backend
${COMPOSE} up -d --force-recreate

echo "==> Verifying postgres credentials..."
i=0
while [ "$i" -lt 15 ]; do
  if ${COMPOSE} exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" >/dev/null 2>&1'; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

if ! ${COMPOSE} exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" >/dev/null 2>&1'; then
  echo "ERROR: Postgres authentication failed (P1000)."
  echo "The data volume was likely initialized with a different POSTGRES_PASSWORD."
  echo "On the server run once (this deletes all database data):"
  echo "  RESET_DB=1 ./scripts/deploy.sh"
  exit 1
fi

echo "==> Waiting for backend..."
i=0
while [ "$i" -lt 45 ]; do
  if curl -sf "http://127.0.0.1:3000/api/jobs?page=1&limit=1" >/dev/null 2>&1; then
    echo "==> Backend is up"
    echo "==> CORS_ORIGIN in container: $(${COMPOSE} exec -T backend printenv CORS_ORIGIN)"
    echo "==> Directus PUBLIC_URL: $(${COMPOSE} exec -T directus printenv PUBLIC_URL 2>/dev/null || echo http://127.0.0.1:8055)"
    ${COMPOSE} ps
    docker image prune -f
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done

echo "ERROR: Backend health check failed"
${COMPOSE} logs --tail=50 backend
echo ""
echo "Check on the server:"
echo "  cat .env"
echo "  ${COMPOSE} exec backend printenv CORS_ORIGIN POSTGRES_PASSWORD POSTGRES_HOST"
echo ""
echo "If logs show P1000, reset the database volume once:"
echo "  RESET_DB=1 ./scripts/deploy.sh"
exit 1
