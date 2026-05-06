const dgram = require('dgram');

const { connectMongo, SignalModel } = require("../database/mongodb");
const { connectPostgres } = require("../database/postgres");
const redis  = require("../database/redis");

const {
  createWorkItem,
  updateWorkItem,
  findOpenWorkItem
} = require("../services/workItemService");

const {
  writeBatchMetrics,
  writeThroughputMetrics,
  writeSignalSeverity,
  closeInflux,
} = require("../database/influx");

const server = dgram.createSocket('udp4');

const PORT              = Number(process.env.UDP_PORT          || 9999);
const BATCH_SIZE        = Number(process.env.BATCH_SIZE        || 1000);
const BATCH_INTERVAL    = Number(process.env.BATCH_INTERVAL_MS || 1000);
const QUEUE_MAX_SIZE    = Number(process.env.QUEUE_MAX_SIZE    || 50000);
const DEBOUNCE_WINDOW_SEC = Number(process.env.DEBOUNCE_WINDOW_SEC || 10);
const DEBOUNCE_WINDOW_MS  = DEBOUNCE_WINDOW_SEC * 1000;
const MAX_RETRIES       = 3;
const RETRY_DELAY_MS    = 500;

const signalBuffer = [];

const metrics = {
  received:         0,
  dropped:          0,
  persisted:        0,
  invalid:          0,
  workItemsCreated: 0,
  workItemsUpdated: 0,
};


async function withRetry(fn, retries = MAX_RETRIES, delayMs = RETRY_DELAY_MS) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[retry] attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs * attempt}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
}


async function shouldCreateWorkItem(signal) {
  const key  = `debounce:${signal.componentId}`;
  const now  = new Date(signal.timestamp).getTime();
  const existing = await redis.get(key);

  if (!existing) {
    await redis.set(key, now, 'EX', DEBOUNCE_WINDOW_SEC);
    return true;
  }

  const lastSeen = parseInt(existing);
  await redis.set(key, now, 'EX', DEBOUNCE_WINDOW_SEC);
  return now - lastSeen > DEBOUNCE_WINDOW_MS;
}


connectMongo();
connectPostgres();


server.on('message', (msg, rinfo) => {
  try {
    metrics.received += 1;

    if (signalBuffer.length >= QUEUE_MAX_SIZE) {
      metrics.dropped += 1;
      return;
    }

    const signal = JSON.parse(msg.toString());
    signal.receivedAt = new Date().toISOString();
    signal.sourceIp   = rinfo.address;

    signalBuffer.push(signal);

    if (signal.severity) {
      writeSignalSeverity(signal.severity);
    }

  } catch (err) {
    metrics.invalid += 1;
    console.error("Invalid signal received:", err.message);
  }
});


setInterval(async () => {
  if (signalBuffer.length === 0) return;

  const batch = signalBuffer.splice(0, BATCH_SIZE);
  let batchWorkItemsCreated = 0;
  let batchWorkItemsUpdated = 0;

  try {
    await withRetry(() => SignalModel.insertMany(batch));
    metrics.persisted += batch.length;
    console.log(`Inserted batch of ${batch.length}`);
  } catch (err) {
    console.error(`Batch insert failed after ${MAX_RETRIES} retries:`, err.message);
    // Signals are lost here — in production push to a dead-letter queue
    return;
  }

  const results = await Promise.allSettled(
    batch.map(async (signal) => {
      const shouldCreate = await shouldCreateWorkItem(signal);

      if (shouldCreate) {
        await withRetry(() => createWorkItem(signal));
        metrics.workItemsCreated += 1;
        batchWorkItemsCreated    += 1;
        console.log("Created work item:", signal.componentId);
      } else {
        const existing = await findOpenWorkItem(signal);
        if (existing) {
          await withRetry(() => updateWorkItem(existing, signal));
          metrics.workItemsUpdated += 1;
          batchWorkItemsUpdated    += 1;
          console.log("Updated work item:", signal.componentId);
        }
      }
    })
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Signal[${i}] work-item processing failed:`, r.reason?.message);
    }
  });

  writeBatchMetrics({
    count:            batch.length,
    workItemsCreated: batchWorkItemsCreated,
    workItemsUpdated: batchWorkItemsUpdated,
  });

}, BATCH_INTERVAL);


setInterval(() => {
  const receivedPerSecond  = metrics.received  / 5;
  const persistedPerSecond = metrics.persisted / 5;

  console.log(
    `[metrics] received=${metrics.received} (${receivedPerSecond.toFixed(2)}/sec) ` +
    `persisted=${metrics.persisted} (${persistedPerSecond.toFixed(2)}/sec) ` +
    `dropped=${metrics.dropped} invalid=${metrics.invalid} ` +
    `queue_depth=${signalBuffer.length}/${QUEUE_MAX_SIZE} ` +
    `work_items_created=${metrics.workItemsCreated} ` +
    `work_items_updated=${metrics.workItemsUpdated}`
  );

  writeThroughputMetrics({
    receivedPerSec:  receivedPerSecond,
    persistedPerSec: persistedPerSecond,
    dropped:         metrics.dropped,
    invalid:         metrics.invalid,
    queueDepth:      signalBuffer.length,
    queueMaxSize:    QUEUE_MAX_SIZE,
  });

  metrics.received         = 0;
  metrics.dropped          = 0;
  metrics.persisted        = 0;
  metrics.invalid          = 0;
  metrics.workItemsCreated = 0;
  metrics.workItemsUpdated = 0;

}, 5000);


async function shutdown(signal) {
  console.log(`[udp] ${signal} received — flushing InfluxDB writes and shutting down...`);
  server.close();
  await closeInflux();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));


server.bind(PORT, () => {
  console.log(`UDP Server listening on port ${PORT}`);
});