const { Pool } = require('pg');

const pool = new Pool({
  user: 'hetjasani',
  password: "root",
  host: 'localhost',
  database: 'ims',
  port: 5432,
});

async function connectPostgres() {
  try {
    const client = await pool.connect();
    console.log("Connected to PostgreSQL");
    client.release();
  } catch (err) {
    console.error("Postgres connection failed:", err);
  }
}

module.exports = {
  pool,
  connectPostgres
};