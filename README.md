# URL Checker — backend

Асинхронная проверка доступности URL (HTTP HEAD/GET).  
NestJS + PostgreSQL + Redis (BullMQ).

## Порты и сервисы

| Сервис | Порт | URL / подключение | Описание |
|--------|------|-------------------|----------|
| **Backend API** | `3000` | http://localhost:3000 | REST API и SSE |
| **Frontend (UI)** | `5173` | http://localhost:5173 | Веб-интерфейс (`3205-front`, Vite dev) |
| **Directus (админка БД)** | `8055` | http://localhost:8055 | UI для таблиц `Job`, `UrlCheckItem` |
| **PostgreSQL** | `5432` | `postgresql://postgres:postgres@localhost:5432/3205-test` | База данных |
| **Redis** | `6379` | `redis://localhost:6379` | Очередь BullMQ и флаги отмены job |

> **Directus** подключён к той же PostgreSQL, что и backend. Таблицы приложения: `Job`, `UrlCheckItem`.

---

## Directus (админка БД)

Локально:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d directus
```

---

## Быстрый запуск (Docker)

Поднимает PostgreSQL, Redis и backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Проверка API:

```bash
curl http://localhost:3000/api/jobs?page=1&limit=1
```

Остановка:

```bash
docker compose down
```

---

## Локальная разработка

### 1. Инфраструктура (PostgreSQL + Redis)

```bash
docker compose up postgres redis -d
```

### 2. Backend

Создайте `.env` в корне проекта:

```env
PORT=3000
CORS_ORIGIN=http://localhost:5173

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/3205-test?schema=public

REDIS_HOST=localhost
REDIS_PORT=6379
```

Установка и миграции:

```bash
yarn install
yarn prisma:deploy
```

Запуск:

```bash
yarn start:dev
```

API будет на http://localhost:3000

### 3. Frontend

В соседней папке `3205-front`:

```bash
yarn install
yarn dev
```

UI откроется на http://localhost:5173 (запросы `/api/*` проксируются на backend `:3000`).

---

## API

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/jobs` | Создать job: `{ "urls": ["https://..."], "proxy?": "socks5://..." }` |
| `GET` | `/api/jobs?page=1&limit=35` | Список jobs (пагинация) |
| `GET` | `/api/jobs/:id` | Детали job |
| `DELETE` | `/api/jobs/:id` | Отменить job |
| `SSE` | `/api/jobs/events` | Обновления списка |
| `SSE` | `/api/jobs/:id/events` | Обновления job |

---

## Production-сборка backend

```bash
yarn build
yarn start:prod
```

Или через Docker:

```bash
docker compose up backend -d --build
```

---

## Полезные команды

```bash
# логи backend в Docker
docker compose logs -f backend

# проверка Redis
docker compose exec redis redis-cli ping

# проверка Directus
curl http://127.0.0.1:8055/server/health

# логи Directus
docker compose logs -f directus

# проверка PostgreSQL
docker compose exec postgres pg_isready -U postgres -d 3205-test
```
