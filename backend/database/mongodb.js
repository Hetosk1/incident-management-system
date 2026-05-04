const mongoose = require("mongoose");

const connectMongo = async () => {

    try {
        await mongoose.connect("mongodb://127.0.0.1:27017/ims"); 
        console.log("MongoDB Connection Successfull");
    } catch(err) {
        console.log(err.message);
    }
}

const SignalSchema = new mongoose.Schema(

  {
    signalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    componentId: {
      type: String,
      required: true,
      index: true,
    },
    componentType: {
      type: String,
      required: true,
      enum: ["MCP_HOST", "API", "CACHE", "QUEUE", "RDBMS"],
    },
    errorType: {
      type: String,
      required: true,
      enum: [
        "PACKET_LOSS",
        "LATENCY_SPIKE",
        "CPU_SPIKE",
        "MEMORY_OVERFLOW",
        "DISK_FULL",
        "HIGH_ERROR_RATE",
        "CONNECTION_TIMEOUT",
      ],
    },
    severity: {
      type: String,
      required: true,
      enum: ["P0", "P1", "P2", "P3"],
      index: true,
    },
    message: {
      type: String,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    sourceIp: {
      type: String,
    },
    metadata: {
      region: {
        type: String,
        index: true,
      },
      version: {
        type: String,
      },
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);


SignalSchema.index({
  componentId: 1,
  errorType: 1,
  timestamp: -1,
});


module.exports = {
    connectMongo,
    SignalModel: mongoose.model("Signal", SignalSchema)
};

