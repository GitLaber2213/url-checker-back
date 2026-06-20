#!/bin/sh
set -e

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "==> Deploy with ${COMPOSE_FILE}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.production.example to .env and configure it."
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" build --pull backend
docker compose -f "${COMPOSE_FILE}" up -d

echo "==> Waiting for backend..."
i=0
while [ "$i" -lt 30 ]; do
  if curl -sf "http://127.0.0.1:3000/api/jobs?page=1&limit=1" >/dev/null 2>&1; then
    echo "==> Backend is up"
    docker compose -f "${COMPOSE_FILE}" ps
    docker image prune -f
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done

echo "ERROR: Backend health check failed"
docker compose -f "${COMPOSE_FILE}" logs --tail=50 backend
exit 1
