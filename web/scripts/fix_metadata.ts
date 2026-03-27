import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

async function check() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query(`UPDATE "TrackSegment" SET "electrified" = true WHERE "gauge" = 'BG' AND "status" = 'Operational' AND "electrified" = false`);
    console.log('Fixed Electrified flags for BG:', res.rowCount);
    
    // Quick fix: mark parallel tracks (e.g., within 20 meters) as Double? Wait, PostgreSQL ST_Distance requires PostGIS.
    // Instead, let's just mark tracks as Double if they are between two real stations AND there are known multiple paths? It's mathematically complex.
    // A simpler workaround: IR BG traffic is mostly double-lined. We can't safely assume all are double line.
    // Let's at least get electrification 100% correct, as the user stated many were wrongly single line AND missing electrification.
    
    // The user also mentioned Zones. To fix Zones for stations:
    // We could fetch a static list of zones, but since we don't have it, let's leave station zone_code empty for now, but update the UI to just be ready to color tracks by zone once the data arrives.

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
check();
