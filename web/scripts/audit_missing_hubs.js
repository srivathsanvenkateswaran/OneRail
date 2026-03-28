require('dotenv').config();
const { Client } = require('pg');

async function main() {
    console.log('--- MISSING JUNCTIONS AUDIT ---');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    
    // First, let's look for the 3 target stations
    const targets = await client.query(`
        SELECT station_code, station_name, latitude, longitude, is_junction
        FROM "Station" 
        WHERE station_name ILIKE '%MADURAI%' 
           OR station_name ILIKE '%KATPADI%' 
           OR station_name ILIKE '%MYSURU%';
    `);
    console.log('\n--- TARGETS FOUND ---');
    targets.rows.forEach(r => console.log(r));

    // Now, let's see how many Junctions are hidden because of missing coords
    const missing = await client.query(`
        SELECT COUNT(*) FROM "Station" 
        WHERE (station_name ILIKE '% Jn%' OR station_name ILIKE '% Junction%') 
          AND (latitude IS NULL OR longitude IS NULL);
    `);
    console.log('\nTotal Named Junctions with NULL coords:', missing.rows[0].count);

    const sample = await client.query(`
        SELECT station_code, station_name FROM "Station" 
        WHERE (station_name ILIKE '% Jn%' OR station_name ILIKE '% Junction%') 
          AND (latitude IS NULL OR longitude IS NULL)
        LIMIT 10;
    `);
    console.log('\nSample Missing Junctions:', sample.rows);

    await client.end();
}

main().catch(console.error);
