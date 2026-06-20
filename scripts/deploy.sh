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

if [ "${RESET_DB:-}" = "1" ]; then
  echo "==> RESET_DB=1: removing postgres volume (database will be recreated)"
  ${COMPOSE} down -v
fi

${COMPOSE} build backend
${COMPOSE} up -d --force-recreate

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
