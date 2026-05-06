# Architecture — Incident Management System

## Overview

IMS is composed of six logical layers: Signal Sources, Ingestion, Storage, Workflow Engine, Observers, and the Frontend. Each layer has a single responsibility and communicates with adjacent layers through well-defined interfaces.

```
Signal Sources
      │ UDP (10k/sec)
      ▼
Ingestion Layer  ──batch──▶  MongoDB (Audit Log)
      │                      InfluxDB (Metrics)
      │
      ▼
Work Item Factory
      │
      ▼
Workflow Engine (State Machine)
  OPEN → INVESTIGATING → RESOLVED → CLOSED
      │
      ├──▶ PostgreSQL (Source of Truth)
      ├──▶ Redis (Hot-Path Cache)
      └──▶ Observers (WebSocket, Alerts, Metrics)
                │
                ▼
           React Dashboard
```

---

## 1. Ingestion Layer

### Protocol Choice: UDP

Signals arrive over UDP on port 9999. UDP is connectionless and has no acknowledgement overhead, which means the server can absorb bursts of up to 10,000 signals/second without TCP backpressure blocking the sender.

### In-Memory Buffer

The UDP message handler never writes directly to a database. Instead, it pushes each parsed signal into a bounded in-memory array (`signalBuffer`). A separate `setInterval` loop flushes the buffer in batches every 1,000ms.

This decouples ingestion speed from persistence speed. If MongoDB is slow, the buffer absorbs the difference. If the buffer reaches `QUEUE_MAX_SIZE` (50,000 entries), additional signals are dropped and counted in the `metrics.dropped` counter — the process never crashes.

### Chain of Responsibility (Ingestion Pipeline)

Signals pass through a sequence of handlers before reaching the work item factory:

1. **Validation Handler** — rejects malformed JSON or missing required fields
2. **Rate Limit Handler** — enforces per-source rate limits on the HTTP ingestion API
3. **Debounce Handler** — uses Redis to check whether a work item already exists for this `componentId` within the last 10 seconds
4. **Enrichment Handler** — attaches `receivedAt` timestamp and `sourceIp` to the signal

Each handler either passes the signal forward or short-circuits the chain.

### Debounce Logic

```
Signal arrives for CACHE_CLUSTER_01
      │
      ▼
Redis GET debounce:CACHE_CLUSTER_01
      │
  ┌───┴───┐
  │ miss  │ hit (within 10s window)
  ▼       ▼
Create   Update existing work item
Work     signal_count += 1
Item     last_seen = now
```

All 100 raw signals are written to MongoDB regardless. Only one work item is created or updated in PostgreSQL.

---

## 2. Storage Layer

Three stores serve distinct purposes. Using the wrong store for a query would either be slow or destroy data guarantees.

### MongoDB — Audit Log

Stores the raw, immutable signal payloads. Every signal that passes validation is inserted here, even duplicates. This is the "what exactly happened" record.

- Indexed on `componentId`, `severity`, and `timestamp` for time-range queries
- Compound index on `(componentId, errorType, timestamp)` for per-component drill-down
- Schema enforced via Mongoose with strict enums for `componentType`, `errorType`, `severity`

### PostgreSQL — Source of Truth

Stores structured Work Items and RCA records. All state transitions are transactional.

```sql
work_items (
  id UUID PRIMARY KEY,
  component_id TEXT NOT NULL,
  error_type   TEXT NOT NULL,
  severity     TEXT NOT NULL,      -- P0 / P1 / P2 / P3
  status       TEXT NOT NULL,      -- OPEN / INVESTIGATING / RESOLVED / CLOSED
  signal_count INT  NOT NULL,
  first_seen   TIMESTAMP NOT NULL,
  last_seen    TIMESTAMP NOT NULL,
  -- RCA fields (populated on close)
  incident_start    TIMESTAMP,
  incident_end      TIMESTAMP,
  rca_category      TEXT,
  fix_applied       TEXT,
  prevention_steps  TEXT,
  mttr              BIGINT,        -- milliseconds
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
)
```

### Redis — Hot-Path Cache

Serves two purposes:

1. **Debounce keys** — `debounce:{componentId}` with 10-second TTL; prevents duplicate work item creation
2. **Dashboard state** — caches the current open incident list so the frontend polling loop (every 2s) does not hammer PostgreSQL

### InfluxDB — Time Series

Receives throughput metrics (signals/sec, work items created/sec) from the ingestion engine every 5 seconds. Enables trend analysis and alerting on sustained high error rates — a use case poorly served by relational or document stores.

---

## 3. Workflow Engine

### State Machine (State Pattern)

Work items follow a strict linear lifecycle. The `status` column in PostgreSQL is the authoritative state. Transitions are validated before each `UPDATE`.

```
OPEN  ──▶  INVESTIGATING  ──▶  RESOLVED  ──▶  CLOSED
  ▲               │                              │
  └───────────────┘ (re-open allowed)            │
                                                 │
                              ← RCA required ────┘
```

The `/close` endpoint calls `hasCompleteRca()` before writing. If `rca_category`, `fix_applied`, or `prevention_steps` is missing or blank, the request is rejected with HTTP 400.

### Alerting Strategy (Strategy Pattern)

Different component types trigger different alert strategies at work item creation time:

| Severity | Component Example | Strategy |
|---|---|---|
| P0 | RDBMS failure | Critical alert — page on-call immediately |
| P1 | API high error rate | High alert — notify team channel |
| P2 | Cache miss spike | Medium alert — create ticket |
| P3 | Latency warning | Low alert — log only |

The strategy is selected by the Work Item Factory based on `signal.severity`. Adding a new severity level requires only a new strategy class — no changes to the factory or state machine.

### Work Item Factory (Factory Pattern)

Centralises work item creation logic. The factory:

1. Determines the correct alert strategy from the signal's `severity`
2. Generates a UUID for the work item
3. Inserts the work item into PostgreSQL with `status = OPEN`
4. Emits a Socket.io event to connected dashboard clients

---

## 4. Observer Layer

Three observers subscribe to work item state changes:

- **WebSocket Observer** — pushes real-time updates to the React dashboard via Socket.io
- **Alert Observer** — dispatches notifications (email, Slack, PagerDuty) based on severity strategy
- **Metrics Observer** — records state transition events to InfluxDB for dashboarding

---

## 5. Observability

### Health Endpoint

```
GET /health
→ { "status": "ok" }
```

Returns 200 when the Express server is up. Can be extended to include DB connectivity checks.

### Throughput Metrics

The ingestion engine prints a metrics snapshot to stdout every 5 seconds:

```
[metrics] received=4821 (964.20/sec) persisted=4821 (964.20/sec)
          dropped=0 invalid=3 queue_depth=0/50000
          work_items_created=12 work_items_updated=47
```

Counters reset after each print window so the rate is a 5-second rolling average, not a cumulative total.

---

## 6. Design Pattern Summary

| Pattern | Where Used | Why |
|---|---|---|
| Chain of Responsibility | Ingestion pipeline | Each validation/enrichment step is independent and composable |
| Factory | Work Item creation | Centralises severity → strategy mapping; single place to change |
| State | Work item lifecycle | Enforces valid transitions; prevents illegal state jumps |
| Strategy | Alerting | Swap alert behaviour per severity without touching core logic |
| Observer | Real-time notifications | Multiple subscribers (WebSocket, Alerts, Metrics) decoupled from the emitter |
