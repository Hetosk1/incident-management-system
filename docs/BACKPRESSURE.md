# Backpressure — How IMS Handles Burst Traffic

## The Problem

In a production incident scenario, failures cascade. A single RDBMS outage can trigger thousands of signals per second from every upstream service trying to reconnect. A naive system that writes each signal synchronously to a database will either:

1. **Crash** — the database connection pool exhausts and the process throws unhandled errors
2. **Block** — async writes pile up, memory grows unbounded, and the event loop stalls
3. **Lose signals silently** — timeouts cause writes to fail with no record

IMS solves this with a layered approach: decouple ingestion from persistence, bound memory usage, and make dropping explicit and measurable.

---

## Layer 1 — Protocol Choice (UDP)

TCP has built-in backpressure: if a receiver is slow, the sender's write buffer fills up and `write()` blocks. At 10,000 signals/second, this would block signal senders from doing anything else.

UDP has no such mechanism. The receiver either processes the datagram immediately or it is lost at the OS level. IMS uses this property intentionally — the ingestion server acknowledges nothing and never slows down senders.

---

## Layer 2 — In-Memory Buffer with Hard Cap

The UDP message handler does one thing: push the parsed signal into an array.

```javascript
server.on('message', (msg, rinfo) => {
  // Hard cap — drop and count, never grow unbounded
  if (signalBuffer.length >= QUEUE_MAX_SIZE) {
    metrics.dropped += 1;
    return;
  }

  const signal = JSON.parse(msg.toString());
  signal.receivedAt = new Date().toISOString();
  signal.sourceIp = rinfo.address;
  signalBuffer.push(signal);
});
```

`QUEUE_MAX_SIZE` defaults to 50,000 (configurable via env var). This caps RAM usage at roughly:

```
50,000 signals × ~500 bytes/signal ≈ 25 MB
```

When the cap is hit, new signals are dropped. The drop count is tracked in `metrics.dropped` and printed every 5 seconds, so operators know exactly how much traffic is being shed and can scale accordingly.

This is a deliberate trade-off: **a bounded, observable drop is safer than an unbounded memory growth that crashes the process.**

---

## Layer 3 — Batched Persistence

A separate `setInterval` loop flushes the buffer to MongoDB in batches, independent of the UDP message handler:

```javascript
setInterval(async () => {
  if (signalBuffer.length === 0) return;

  // Take up to BATCH_SIZE items — never block the next interval
  const batch = signalBuffer.splice(0, BATCH_SIZE);

  try {
    await SignalModel.insertMany(batch);
    metrics.persisted += batch.length;
    // ... work item logic
  } catch (err) {
    // Batch failed — signals are lost, but the process survives
    console.error('Batch processing failed:', err);
  }

}, BATCH_INTERVAL);
```

Key properties of this design:

- **Non-blocking** — `splice` removes items atomically from the front of the array; the next UDP event can push to the back simultaneously without a lock
- **Bounded batch size** — even if 10,000 signals arrive in one second, only `BATCH_SIZE` (1,000) are flushed per tick; the rest wait in the buffer
- **Failure isolation** — if MongoDB is down for one tick, that batch is lost but the buffer continues accumulating for the next tick; the process does not crash

---

## Layer 4 — Redis Debounce (Work Item Flood Prevention)

Even with batching, 10,000 signals for the same component would create 10,000 PostgreSQL rows if each signal spawned a work item. Redis prevents this:

```
Signal for CACHE_CLUSTER_01 arrives
      │
      ▼
Redis GET debounce:CACHE_CLUSTER_01
      │
   ┌──┴──┐
  miss   hit (within DEBOUNCE_WINDOW_SEC)
   │     │
   ▼     ▼
Create  Update existing work item
new     signal_count += 1
item    last_seen = now
   │
   ▼
Redis SET debounce:CACHE_CLUSTER_01 EX 10
```

The Redis key expires after `DEBOUNCE_WINDOW_SEC` (default: 10 seconds). If no new signals arrive within that window, the next signal will create a fresh work item.

This means 100 signals in 10 seconds → 1 work item in PostgreSQL, 100 raw documents in MongoDB. The database write rate to PostgreSQL stays orders of magnitude lower than the ingestion rate.

---

## Layer 5 — Observability

Every layer of backpressure is measured. The ingestion engine prints a full metrics snapshot every 5 seconds:

```
[metrics] received=9847 (1969.40/sec) persisted=9847 (1969.40/sec)
          dropped=153 invalid=2 queue_depth=1240/50000
          work_items_created=8 work_items_updated=31
```

| Metric | What It Tells You |
|---|---|
| `received/sec` | Raw ingestion rate at the UDP socket |
| `persisted/sec` | Rate of successful MongoDB writes |
| `dropped` | Signals shed due to buffer cap — if non-zero, consider scaling |
| `invalid` | Malformed JSON packets — useful for debugging senders |
| `queue_depth` | Current buffer fill level — rising means persistence is slower than ingestion |
| `work_items_created` | New incidents opened this window |
| `work_items_updated` | Existing incidents receiving new signals |

Counters reset after each 5-second window, so rates are rolling averages — not cumulative totals — making spikes immediately visible.

---

## Summary

| Layer | Mechanism | Protects Against |
|---|---|---|
| Protocol | UDP (connectionless) | TCP backpressure blocking senders |
| Buffer cap | `QUEUE_MAX_SIZE` drop | Unbounded memory growth |
| Batch flush | `setInterval` + `splice` | Slow DB writes stalling ingestion |
| Debounce | Redis TTL key | Work item explosion under signal storms |
| Observability | 5-sec metrics log | Silent failures going undetected |
