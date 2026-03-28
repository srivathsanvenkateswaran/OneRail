require('dotenv').config();
const { Client } = require('pg');

async function main() {
    console.log('--- DB Check ---');
    console.log('URL:', process.env.DATABASE_URL);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    
    const s = await client.query('SELECT COUNT(*) FROM "Station";');
    const t = await client.query('SELECT COUNT(*) FROM "TrackSegment";');
    const sec = await client.query('SELECT COUNT(*) FROM "TrackSection";');
    
    console.log('Stations Tracked:', s.rows[0].count);
    console.log('Segments Tracked:', t.rows[0].count);
    console.log('Sections Tracked:', sec.rows[0].count);
    
    const target = await client.query(`
        SELECT station_code, station_name, latitude, longitude 
        FROM "Station" 
        WHERE station_name ILIKE '%MADURAI%' 
           OR station_name ILIKE '%KATPADI%' 
           OR station_name ILIKE '%MYSURU%';
    `);
    console.log('\n--- TARGET SEARCH ---');
    target.rows.forEach(r => console.log(r));
    
    await client.end();
}

main().catch(console.error);
