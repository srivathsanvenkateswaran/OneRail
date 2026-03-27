import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

async function check() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query(`SELECT "zone_code", COUNT(*) FROM "Station" WHERE "zone_code" IS NOT NULL GROUP BY "zone_code"`);
    console.log('Zones distribution:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
check();
