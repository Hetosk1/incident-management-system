# Incident Management System (IMS)

A production-grade distributed incident management platform built to ingest, process, and resolve high-volume failure signals across a complex infrastructure stack.

---

## What It Does

IMS monitors APIs, MCP Hosts, Distributed Caches, Async Queues, RDBMS, and NoSQL stores. When failures occur, signals are ingested over UDP, deduplicated via a debounce window, and surfaced as structured Work Items through a workflow-driven dashboard. Every incident must go through a mandatory Root Cause Analysis (RCA) before it can be closed.

---

## Repository Structure

```
incident-management-system/
├── backend/
│   ├── database/
│   │   ├── mongodb.js          # Signal audit log (raw signals)
│   │   ├── postgres.js         # Source of truth (work items + RCA)
│   │   ├── redis.js            # Hot-path cache + debounce
│   │   └── createtable.sql     # PostgreSQL schema
│   ├── ingestion-engine/
│   │   └── UDPReceiver.js      # High-throughput UDP signal ingestion
│   ├── sender-engine/
│   │   ├── UDPSender.js        # Signal simulation script
│   │   └── signals.json        # Mock failure event dataset
│   ├── services/
│   │   ├── workItemService.js  # Work item CRUD
│   │   └── rcaService.js       # RCA validation + MTTR calculation
│   ├── socket/
│   │   └── socket.js           # Socket.io initialisation
│   ├── tests/
│   │   └── rcaService.test.js  # Unit tests (Node built-in test runner)
│   ├── index.js                # Express REST API entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   └── ActiveIncidents.jsx   # Main dashboard + RCA form
│   │   ├── api/fetchAPI.js           # HTTP client helpers
│   │   └── socket/socket.js          # WebSocket client
│   └── package.json
├── docs/                        # This folder
├── docker-compose.yml
└── README.md
```

---

## Quick Start

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd incident-management-system

# 2. Start all infrastructure + backend
docker compose up -d

# 3. Start the frontend (dev mode)
cd frontend && npm install && npm run dev

# 4. Simulate a failure event
cd backend/sender-engine && node UDPSender.js
```

The dashboard will be available at `http://localhost:5173`.  
The REST API runs at `http://localhost:3000`.  
The UDP ingestion port is `9999`.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Ingestion | Node.js (dgram UDP) | High-throughput signal receiver |
| Source of Truth | PostgreSQL | Work items, state, RCA records |
| Audit Log | MongoDB | Raw signal payloads (immutable) |
| Hot-Path Cache | Redis | Dashboard state + debounce keys |
| Time Series | InfluxDB | Throughput metrics & aggregations |
| API | Express.js | REST endpoints |
| Real-time | Socket.io | WebSocket push to dashboard |
| Frontend | React + Vite | Incident dashboard |
| Infra | Docker Compose | One-command environment setup |

---

## Key Design Decisions

- **UDP over TCP for ingestion** — connectionless, no handshake overhead, survives 10k signals/sec bursts without backpressure from the persistence layer
- **In-memory buffer with cap** — signals accumulate in RAM and are flushed in batches; if the buffer hits `QUEUE_MAX_SIZE` (50,000), new signals are dropped and counted in metrics rather than crashing the process
- **Redis debounce** — prevents 100 signals for the same component within 10 seconds from creating 100 work items; only one work item is created while all signals are linked to it in MongoDB
- **Mandatory RCA gate** — the `/close` endpoint rejects requests unless `rca_category`, `fix_applied`, and `prevention_steps` are all present and non-empty
- **MTTR auto-calculation** — computed from `incident_start` and `incident_end` on RCA submission; stored in milliseconds

---

## Running Tests

```bash
cd backend
node --test tests/*.test.js
```

---

## Docs

| Document | Description |
|---|---|
| [Architecture](./docs/ARCHITECTURE.md) | System design, data flows, design patterns |
| [API Reference](./docs/API_REFERENCE.md) | All REST endpoints with request/response shapes |
| [Setup Guide](./docs/SETUP_GUIDE.md) | Detailed environment setup and configuration |
| [Backpressure](./docs/BACKPRESSURE.md) | How the system handles burst traffic without crashing |
