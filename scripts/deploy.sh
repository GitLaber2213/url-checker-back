#!/bin/sh
set -e

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "==> Deploy with ${COMPOSE_FILE}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.production.example to .env and configure it."
  exit 1
fi

COMPOSE="docker compose --env-file .env -f ${COMPOSE_FILE}"

${COMPOSE} build --pull backend
${COMPOSE} up -d --force-recreate

echo "==> Waiting for backend..."
i=0
while [ "$i" -lt 30 ]; do
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
exit 1
