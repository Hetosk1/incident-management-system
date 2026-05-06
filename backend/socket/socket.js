let io;

function initSocket(server) {
  io = new (require("socket.io").Server)(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    console.log("Dashboard client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Dashboard client disconnected:", socket.id);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket not initialized");
  return io;
}

function emitWorkItemUpdate(event, workItem) {
  if (!io) return;
  io.emit(event, workItem);  
}

module.exports = { initSocket, getIO, emitWorkItemUpdate };