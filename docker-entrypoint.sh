#!/bin/sh
set -e

if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export DATABASE_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-3205-postgres}:5432/${POSTGRES_DB:-3205-test}?schema=public"
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: POSTGRES_PASSWORD or DATABASE_URL must be set."
  echo "Use: docker compose up --build"
  exit 1
fi

wait_for_db() {
  echo "Waiting for database..."
  i=0
  while [ "$i" -lt 30 ]; do
    if node -e "
      const url = new URL(process.env.DATABASE_URL.replace(/^postgresql:/, 'http:'));
      const net = require('net');
      const socket = net.createConnection({
        host: url.hostname,
        port: url.port || 5432,
      });
      socket.setTimeout(2000);
      socket.on('connect', () => { socket.destroy(); process.exit(0); });
      socket.on('error', () => process.exit(1));
      socket.on('timeout', () => { socket.destroy(); process.exit(1); });
    " 2>/dev/null; then
      echo "Database is reachable."
      return 0
    fi
    i=$((i + 1))
    echo "Retry $i/30..."
    sleep 2
  done

  echo ""
  echo "ERROR: Cannot reach database at DATABASE_URL host."
  exit 1
}

wait_for_db

echo "Running database migrations..."
yarn prisma:deploy

echo "Starting application..."
exec node dist/main.js
