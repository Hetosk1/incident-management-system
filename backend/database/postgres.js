const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PG_USER || 'hetjasani',
  password: process.env.PG_PASSWORD || 'root',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'ims',
  port: Number(process.env.PG_PORT || 5432),
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
