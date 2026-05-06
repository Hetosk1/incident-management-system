# Setup Guide — Incident Management System

## Prerequisites

| Tool | Minimum Version | Notes |
|---|---|---|
| Docker | 24.x | Required for infrastructure |
| Docker Compose | 2.x | Bundled with Docker Desktop |
| Node.js | 18.x | For running tests and frontend dev |
| npm | 9.x | Bundled with Node.js |

---

## 1. Clone the Repository

```bash
git clone <repo-url>
cd incident-management-system
```

---

## 2. Start Infrastructure with Docker Compose

```bash
docker compose up -d
```

This starts five services and waits for each to pass its health check before starting dependents:

| Container | Port | Health Check |
|---|---|---|
| `ims_postgres` | 5432 | `pg_isready` |
| `ims_mongo` | 27017 | `mongosh ping` |
| `ims_redis` | 6379 | `redis-cli ping` |
| `ims_influxdb` | 8086 | `influx ping` |
| `ims_backend` | 3000 (REST), 9999/udp | — |

Check that all containers are healthy:

```bash
docker compose ps
```

You should see `healthy` for all infrastructure containers before the backend starts.

---

## 3. Initialise the Database Schema

On first run, create the PostgreSQL table:

```bash
docker exec -i ims_postgres psql -U ims_user -d ims_db < backend/database/createtable.sql
```

The SQL uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so it is safe to re-run.

---

## 4. Start the Frontend (Development)

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be at `http://localhost:5173`.

---

## 5. Simulate a Failure Event

The sender engine ships with a `signals.json` file containing pre-built mock signals simulating an RDBMS outage followed by an MCP failure.

```bash
cd backend/sender-engine
node UDPSender.js
```

Within a few seconds you should see work items appear in the dashboard.

To generate continuous high-volume traffic:

```bash
# Send 10,000 signals at ~1,000/sec
node UDPSender.js --rate 1000 --count 10000
```

---

## 6. Verify the System is Working

**Check the health endpoint:**
```bash
curl http://localhost:3000/health
# → { "status": "ok" }
```

**Check for open work items:**
```bash
curl http://localhost:3000/work-items/open
```

**Watch ingestion metrics in the backend logs:**
```bash
docker logs ims_backend -f
```

You should see a metrics line every 5 seconds:
```
[metrics] received=4821 (964.20/sec) persisted=4821 ...
```

---

## 7. Run the Tests

```bash
cd backend
node --test tests/*.test.js
```

All 5 unit tests should pass. No additional test dependencies are required — the test runner is built into Node.js 18+.

---

## Environment Variables

All configuration is driven by environment variables. Defaults are set in `docker-compose.yml`. When running outside Docker, you can create a `.env` file in the `backend/` directory.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Express REST API port |
| `UDP_PORT` | `9999` | UDP ingestion port |
| `PG_HOST` | `localhost` | PostgreSQL host |
| `PG_PORT` | `5432` | PostgreSQL port |
| `PG_USER` | `hetjasani` | PostgreSQL user |
| `PG_PASSWORD` | `root` | PostgreSQL password |
| `PG_DATABASE` | `ims` | PostgreSQL database name |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/ims` | MongoDB connection string |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `INFLUX_URL` | `http://influxdb:8086` | InfluxDB URL |
| `INFLUX_TOKEN` | `ims-influx-token-secret` | InfluxDB API token |
| `INFLUX_ORG` | `ims_org` | InfluxDB organisation |
| `INFLUX_BUCKET` | `ims_signals` | InfluxDB bucket |
| `DEBOUNCE_WINDOW_SEC` | `10` | Seconds before a new work item can be created for the same component |
| `QUEUE_MAX_SIZE` | `50000` | Max in-memory buffer size before signals are dropped |
| `BATCH_SIZE` | `1000` | Signals flushed to MongoDB per batch |
| `BATCH_INTERVAL_MS` | `1000` | Milliseconds between batch flushes |

---

## Stopping and Cleaning Up

```bash
# Stop containers (preserves volumes / data)
docker compose down

# Stop and delete all data volumes
docker compose down -v
```

---

## Common Issues

**Backend fails to connect to PostgreSQL on startup**

The backend starts after all infrastructure containers pass their health checks. If you see connection errors, check that `ims_postgres` is healthy:

```bash
docker compose ps ims_postgres
```

If it is stuck in `starting`, inspect its logs:

```bash
docker logs ims_postgres
```

**No work items appearing after running UDPSender**

1. Confirm the backend is running: `curl http://localhost:3000/health`
2. Check that the PostgreSQL schema has been initialised (step 3 above)
3. Check the backend logs for batch processing errors: `docker logs ims_backend -f`

**Frontend shows "Failed to fetch incidents"**

The frontend calls `http://localhost:3000` directly. Ensure the backend container is running and CORS is not blocked by a browser extension.
