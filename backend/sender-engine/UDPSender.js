const dgram = require('dgram');
const fs = require('fs');

const client = dgram.createSocket('udp4');

// Load signals from JSON file
const signals = JSON.parse(fs.readFileSync('signals.json', 'utf-8'));

let index = 0;

function sendNext() {
  if (index >= signals.length) {
    console.log('All signals sent');
    client.close();
    return;
  }

  const signal = signals[index];
  const message = Buffer.from(JSON.stringify(signal));

  client.send(message, 9999, 'localhost', (err) => {
    if (err) console.error(err);
  });

  index++;

  // small delay to avoid flooding (adjust as needed)
  setTimeout(sendNext, 0);
}

sendNext();