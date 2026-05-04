const { pool } = require('../database/postgres');
const { v4: uuidv4 } = require('uuid');


const {getIO} = require("../socket/socket"); 

async function createWorkItem(signal) {
  const query = `
    INSERT INTO work_items (
      id,
      component_id,
      error_type,
      severity,
      status,
      signal_count,
      first_seen,
      last_seen,
      created_at,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *;
  `;

  const values = [
    uuidv4(),
    signal.componentId,
    signal.errorType,
    signal.severity,
    'OPEN',
    1,
    new Date(signal.timestamp),
    new Date(signal.timestamp),
    new Date(),
    new Date()
  ];


  const result = await pool.query(query, values);
  console.log("signal emitted"); 
  return result.rows[0];
}

async function findOpenWorkItem(signal) {
  const query = `
    SELECT * FROM work_items
    WHERE component_id = $1
      AND error_type = $2
      AND severity = $3
      AND status = 'OPEN'
      AND last_seen >= NOW() - INTERVAL '10 seconds'
    LIMIT 1;
  `;

  const values = [
    signal.componentId,
    signal.errorType,
    signal.severity
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function updateWorkItem(existingItem, signal) {

  const query = `
  UPDATE work_items
    SET 
        signal_count = signal_count + 1,
        last_seen = NOW()
    WHERE id = $1;`;

  const values = [
    new Date(signal.timestamp),
    new Date(),
    existingItem.id
  ];


  const result = await pool.query(query, values);
  console.log("signal emitted"); 
  return result.rows[0];
}

module.exports = {
  createWorkItem,
  updateWorkItem,
  findOpenWorkItem  
};