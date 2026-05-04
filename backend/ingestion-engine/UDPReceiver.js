const dgram = require('dgram');
const fs = require('fs');

const { connectMongo, SignalModel } = require("../database/mongodb");
const { connectPostgres } = require("../database/postgres");
const redis  = require("../database/redis"); 


const {
  createWorkItem,
  updateWorkItem,
  findOpenWorkItem
} = require("../services/workItemService");

const server = dgram.createSocket('udp4');

const PORT = 9999;

const signalBuffer = [];
const BATCH_SIZE = 1000;
const BATCH_INTERVAL = 1000;

async function shouldCreateWorkItem(signal) {
  const key = `debounce:${signal.componentId}`;
  const now = new Date(signal.timestamp).getTime();

  const existing = await redis.get(key);

  if (!existing) {
    await redis.set(key, now, 'EX', 10);
    return true;
  }

  const lastSeen = parseInt(existing);

  if (now - lastSeen <= 10000) {
    await redis.set(key, now, 'EX', 10);
    return false;
  }

  await redis.set(key, now, 'EX', 10);
  return true;
}

const FILE_PATH = 'signals.log';
if (!fs.existsSync(FILE_PATH)) {
  fs.writeFileSync(FILE_PATH, '');
}


connectMongo();
connectPostgres();


server.on('message', (msg, rinfo) => {
  try {
    const signal = JSON.parse(msg.toString());

    signal.receivedAt = new Date().toISOString();
    signal.sourceIp = rinfo.address;

    signalBuffer.push(signal);

  } catch (err) {
    console.error("Invalid signal received:", err.message);
  }
});


setInterval(async () => {
  if (signalBuffer.length === 0) return;

  const batch = signalBuffer.splice(0, BATCH_SIZE);

  try {
    await SignalModel.insertMany(batch);
    console.log(`Inserted batch of ${batch.length}`);

    for (const signal of batch) {

      const shouldCreate = await shouldCreateWorkItem(signal);

      if (shouldCreate) {
        await createWorkItem(signal);
        console.log("Created work item:", signal.componentId);

      } else {
        const existing = await findOpenWorkItem(signal);

        if (existing) {
          await updateWorkItem(existing, signal);
          console.log("Updated work item:", signal.componentId);
        }
      }
    }

  } catch (err) {
    console.error("Batch processing failed:", err);
  }

}, BATCH_INTERVAL);


// 🚀 START SERVER
server.bind(PORT, () => {
  console.log(`UDP Server listening on port ${PORT}`);
});