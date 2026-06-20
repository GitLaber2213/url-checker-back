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
  echo "Production .env needs only POSTGRES_* and CORS_ORIGIN."
  exit 1
fi

if ! grep -q '^POSTGRES_PASSWORD=.\+' .env; then
  echo "ERROR: POSTGRES_PASSWORD is missing or empty in .env"
  exit 1
fi

COMPOSE="docker compose --env-file .env -f ${COMPOSE_FILE}"
POSTGRES_VOLUME="${POSTGRES_VOLUME:-3205_postgres_data_v2}"

if [ "${RESET_DB:-}" = "1" ]; then
  echo "==> RESET_DB=1: removing postgres volume (database will be recreated)"
  ${COMPOSE} down -v --remove-orphans 2>/dev/null || true
  docker rm -f 3205-postgres 3205-backend 3205-redis 2>/dev/null || true
  docker volume rm "${POSTGRES_VOLUME}" 2>/dev/null || true
  docker volume rm url-checker-back_postgres_data_v2 2>/dev/null || true
fi

# Podman reuses anonymous volumes from the previous container unless it is removed first.
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
echo "  ${COMPOSE} exec backend printenv POSTGRES_PASSWORD POSTGRES_HOST"
echo ""
echo "If logs show P1000, reset the database volume once:"
echo "  RESET_DB=1 ./scripts/deploy.sh"
exit 1
