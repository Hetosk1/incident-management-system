const { InfluxDB, Point } = require('@influxdata/influxdb-client');

const INFLUX_URL    = process.env.INFLUX_URL    || 'http://localhost:8086';
const INFLUX_TOKEN  = process.env.INFLUX_TOKEN  || 'ims-influx-token-secret';
const INFLUX_ORG    = process.env.INFLUX_ORG    || 'ims_org';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'ims_signals';

const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });


const writeApi = client.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 's');

writeApi.useDefaultTags({ service: 'ims-backend' });

function writeBatchMetrics({ count, workItemsCreated, workItemsUpdated }) {
  const point = new Point('signal_batch')
    .intField('count', count)
    .intField('work_items_created', workItemsCreated)
    .intField('work_items_updated', workItemsUpdated);

  writeApi.writePoint(point);
}


function writeThroughputMetrics({
  receivedPerSec,
  persistedPerSec,
  dropped,
  invalid,
  queueDepth,
  queueMaxSize,
}) {
  const point = new Point('throughput')
    .floatField('received_per_sec',  receivedPerSec)
    .floatField('persisted_per_sec', persistedPerSec)
    .intField('dropped',     dropped)
    .intField('invalid',     invalid)
    .intField('queue_depth', queueDepth)
    .intField('queue_max',   queueMaxSize);

  writeApi.writePoint(point);
}


function writeSignalSeverity(severity) {
  const point = new Point('signal_severity')
    .tag('severity', severity)
    .intField('count', 1);

  writeApi.writePoint(point);
}


async function closeInflux() {
  try {
    await writeApi.close();
    console.log('[influx] write client closed');
  } catch (err) {
    console.error('[influx] error closing write client:', err.message);
  }
}

module.exports = {
  writeBatchMetrics,
  writeThroughputMetrics,
  writeSignalSeverity,
  closeInflux,
};