
const express = require("express");
const cors = require("cors"); 
const http = require("http"); 
const rateLimit = require("express-rate-limit");  

const app = express(); 
const server = http.createServer(app);

const { connectPostgres, pool } = require('./database/postgres');
const { initSocket } = require("./socket/socket"); 
const { SignalModel } = require("./database/mongodb");
const {
  calculateMttr,
  hasCompleteRca,
  validateRcaPayload
} = require("./services/rcaService");

initSocket(server);
connectPostgres();

app.use(cors());
app.use(express.json()); 

// --- FIX: Rate limiter ---
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,      
  max: 200,                 
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, slow down." }
});
app.use(apiLimiter);


app.get('/health', (_req, res) => {
  res.json({ status: "ok" });
});


app.get("/work-items", async (_req, res) => {
  try { 
    const result = await pool.query(
      "SELECT * FROM work_items ORDER BY created_at DESC"
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) { 
    res.status(500).json({ success: false, message: err.message });
  }
});


app.get("/work-items/open", async (_req, res) => {
  try { 
    const result = await pool.query(`
      SELECT * FROM work_items
      WHERE status != 'CLOSED'
      ORDER BY 
        CASE severity
          WHEN 'P0' THEN 1
          WHEN 'P1' THEN 2
          WHEN 'P2' THEN 3
          ELSE 4
        END,
        created_at DESC;
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { 
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/work-items/:id/rca", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      incident_start,
      incident_end,
      rca_category,
      fix_applied,
      prevention_steps
    } = req.body;

    const validation = validateRcaPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Invalid RCA payload",
        errors: validation.errors
      });
    }

    const mttr = calculateMttr(incident_start, incident_end);

    const result = await pool.query(`
      UPDATE work_items
      SET 
        incident_start = $1,
        incident_end = $2,
        rca_category = $3,
        fix_applied = $4,
        prevention_steps = $5,
        mttr = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `, [
      incident_start,
      incident_end,
      rca_category,
      fix_applied,
      prevention_steps,
      mttr,
      id
    ]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Work item not found" });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/work-items/:id/transition", async (req, res) => {
  const VALID_TRANSITIONS = {
    OPEN: ["INVESTIGATING"],
    INVESTIGATING: ["RESOLVED", "OPEN"],
    RESOLVED: ["CLOSED"],
    CLOSED: []
  };

  try {
    const { id } = req.params;
    const { to } = req.body;

    const check = await pool.query("SELECT * FROM work_items WHERE id = $1", [id]);
    const item = check.rows[0];

    if (!item) return res.status(404).json({ success: false, message: "Work item not found" });

    const allowed = VALID_TRANSITIONS[item.status] || [];

    if (!allowed.includes(to)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${item.status} to ${to}`
      });
    }

    const result = await pool.query(
      "UPDATE work_items SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *;",
      [to, id]
    );

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/work-items/:id/close", async (req, res) => {
  try {
    const { id } = req.params;

    const check = await pool.query(`
      SELECT rca_category, fix_applied, prevention_steps, status
      FROM work_items WHERE id = $1
    `, [id]);

    const item = check.rows[0];

    if (!item) return res.status(404).json({ success: false, message: "Work item not found" });

    if (!hasCompleteRca(item)) {
      return res.status(400).json({ success: false, message: "RCA required before closing" });
    }

    const result = await pool.query(
      "UPDATE work_items SET status = 'CLOSED', updated_at = NOW() WHERE id = $1 RETURNING *;",
      [id]
    );

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.get("/signals/:componentId", async (req, res) => {
  try {
    const { componentId } = req.params;

    const signals = await SignalModel.find({ componentId })
      .limit(50)
      .sort({ timestamp: -1 });

    res.json({ success: true, data: signals });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


server.listen(3000, () => { 
  console.log("Server running at 3000");
});