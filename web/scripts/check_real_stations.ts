import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const res = await pool.query(`SELECT COUNT(*) FROM "Station" WHERE "station_code" NOT LIKE 'OSM_%' AND "latitude" IS NOT NULL`);
    console.log('Real Stations WITH coordinates:', res.rows[0].count);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
