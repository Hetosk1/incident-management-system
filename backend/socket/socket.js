let io;

function initSocket(server) {
  io = new (require("socket.io").Server)(server, {
    cors: { origin: "*" }
  });
  return io;
}

function getIO() {
  if (!io) throw new Error("Socket not initialized");
  return io;
}

module.exports = { initSocket, getIO };