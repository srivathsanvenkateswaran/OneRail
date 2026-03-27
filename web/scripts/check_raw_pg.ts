import dotenv from 'dotenv';
dotenv.config();
import pkg from 'pg';
const { Pool } = pkg;

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const res = await pool.query('SELECT COUNT(*) FROM "TrackSegment"');
    console.log('Track count using raw PG:', res.rows[0].count);
  } catch (err) {
    console.error('Raw PG connection error:', err);
  } finally {
    await pool.end();
  }
}

check();
