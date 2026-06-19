#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set."
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
  echo ""
  echo "If you run the image with 'docker run', connect to compose network:"
  echo "  docker compose up postgres redis -d"
  echo "  docker run --rm -p 3000:3000 --network 3205-app -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/3205-test -e REDIS_HOST=redis 3205-back-backend"
  echo ""
  echo "Recommended: docker compose up --build"
  exit 1
}

wait_for_db

echo "Running database migrations..."
yarn prisma:deploy

echo "Starting application..."
exec node dist/main.js
