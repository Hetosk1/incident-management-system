# API Reference — Incident Management System

Base URL: `http://localhost:3000`

All responses return JSON. All error responses include `success: false` and a human-readable `message`.

---

## Health

### `GET /health`

Returns server status. Use this in Docker health checks and uptime monitors.

**Response**
```json
{ "status": "ok" }
```

---

## Work Items

### `GET /work-items`

Returns all work items ordered by creation time descending.

**Response**
```json
{
  "success": true,
  "data": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "component_id": "CACHE_CLUSTER_01",
      "error_type": "CONNECTION_TIMEOUT",
      "severity": "P1",
      "status": "OPEN",
      "signal_count": 47,
      "first_seen": "2026-05-05T10:00:00.000Z",
      "last_seen": "2026-05-05T10:00:45.000Z",
      "incident_start": null,
      "incident_end": null,
      "rca_category": null,
      "fix_applied": null,
      "prevention_steps": null,
      "mttr": null,
      "created_at": "2026-05-05T10:00:00.000Z",
      "updated_at": "2026-05-05T10:00:45.000Z"
    }
  ]
}
```

---

### `GET /work-items/open`

Returns only open (`status = 'OPEN'`) work items, sorted by severity (P0 first) then creation time descending. This is the primary endpoint used by the dashboard live feed.

**Response**
```json
{
  "success": true,
  "result": {
    "rows": [ /* same shape as above */ ]
  }
}
```

---

### `POST /work-items/:id/rca`

Submits a Root Cause Analysis for a work item. Validates all required fields and date ordering before writing. Calculates and stores MTTR automatically.

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Work item ID |

**Request Body**

```json
{
  "incident_start": "2026-05-05T10:00",
  "incident_end": "2026-05-05T10:30",
  "rca_category": "DB Issue",
  "fix_applied": "Restarted the failed database node and re-seeded the replica.",
  "prevention_steps": "Added automated disk and connection pool alerts."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `incident_start` | ISO 8601 datetime | Yes | Must be a valid date |
| `incident_end` | ISO 8601 datetime | Yes | Must be after `incident_start` |
| `rca_category` | string | Yes | One of: `DB Issue`, `API Failure`, `Network`, `Infra` |
| `fix_applied` | string | Yes | Non-empty |
| `prevention_steps` | string | Yes | Non-empty |

**Success Response** `200`
```json
{
  "success": true,
  "data": {
    "id": "f47ac10b-...",
    "rca_category": "DB Issue",
    "fix_applied": "Restarted the failed database node and re-seeded the replica.",
    "prevention_steps": "Added automated disk and connection pool alerts.",
    "mttr": 1800000,
    "incident_start": "2026-05-05T10:00:00.000Z",
    "incident_end": "2026-05-05T10:30:00.000Z"
  }
}
```

**Validation Error** `400`
```json
{
  "success": false,
  "message": "Invalid RCA payload",
  "errors": [
    "fix_applied is required",
    "incident_end must be after incident_start"
  ]
}
```

**Not Found** `404`
```json
{
  "success": false,
  "message": "Work item not found"
}
```

---

### `POST /work-items/:id/close`

Transitions a work item to `CLOSED` status. **Requires a complete RCA to have been submitted first.** If any RCA field is missing or blank, the request is rejected.

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Work item ID |

**Request Body** — none required

**Success Response** `200`
```json
{
  "success": true,
  "data": {
    "id": "f47ac10b-...",
    "status": "CLOSED",
    "updated_at": "2026-05-05T10:35:00.000Z"
  }
}
```

**RCA Missing** `400`
```json
{
  "success": false,
  "message": "RCA required before closing"
}
```

**Not Found** `404`
```json
{
  "success": false,
  "message": "Work item not found"
}
```

---

## Signals

### `GET /signals/:componentId`

Returns the 50 most recent raw signals for a given component, pulled from MongoDB. Used by the Incident Detail view to show the raw signal timeline.

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `componentId` | string | e.g. `CACHE_CLUSTER_01` |

**Response**
```json
{
  "success": true,
  "data": [
    {
      "signalId": "sig-001",
      "componentId": "CACHE_CLUSTER_01",
      "componentType": "CACHE",
      "errorType": "CONNECTION_TIMEOUT",
      "severity": "P1",
      "message": "Redis connection pool exhausted",
      "timestamp": "2026-05-05T10:00:44.000Z",
      "sourceIp": "10.0.0.12",
      "metadata": {
        "region": "us-east-1",
        "version": "7.2.1"
      }
    }
  ]
}
```

---

## UDP Ingestion

Signals are ingested over UDP, not HTTP. Send a JSON payload to `udp://localhost:9999`.

**Signal Payload Shape**

```json
{
  "signalId": "sig-abc-123",
  "componentId": "RDBMS_PRIMARY",
  "componentType": "RDBMS",
  "errorType": "CONNECTION_TIMEOUT",
  "severity": "P0",
  "message": "Primary database not accepting connections",
  "timestamp": "2026-05-05T10:00:00.000Z",
  "metadata": {
    "region": "us-east-1",
    "version": "15.3"
  }
}
```

**Valid enum values**

| Field | Allowed Values |
|---|---|
| `componentType` | `MCP_HOST`, `API`, `CACHE`, `QUEUE`, `RDBMS` |
| `errorType` | `PACKET_LOSS`, `LATENCY_SPIKE`, `CPU_SPIKE`, `MEMORY_OVERFLOW`, `DISK_FULL`, `HIGH_ERROR_RATE`, `CONNECTION_TIMEOUT` |
| `severity` | `P0`, `P1`, `P2`, `P3` |

**Sending a test signal (Node.js)**

```javascript
const dgram = require('dgram');
const client = dgram.createSocket('udp4');

const signal = JSON.stringify({
  signalId: `sig-${Date.now()}`,
  componentId: 'RDBMS_PRIMARY',
  componentType: 'RDBMS',
  errorType: 'CONNECTION_TIMEOUT',
  severity: 'P0',
  message: 'Primary database not accepting connections',
  timestamp: new Date().toISOString(),
  metadata: { region: 'us-east-1', version: '15.3' }
});

client.send(signal, 9999, 'localhost', () => client.close());
```

---

## MTTR Calculation

MTTR is stored in **milliseconds**. To display in minutes:

```javascript
const mttrMinutes = (mttr / 1000 / 60).toFixed(2);
```

The calculation is: `new Date(incident_end).getTime() - new Date(incident_start).getTime()`
