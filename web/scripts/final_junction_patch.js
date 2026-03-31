require('dotenv').config();
const { Client } = require('pg');

const MANUAL_PATCHES = [
    // Previously patched
    { code: 'TEL', lat: 16.2415, lon: 80.6455 },
    { code: 'BSB', lat: 25.3284, lon: 82.9902 },
    { code: 'CBE', lat: 10.9996, lon: 76.9654 },
    { code: 'MAO', lat: 15.2731, lon: 73.9698 },
    { code: 'KPD', lat: 12.9691, lon: 79.1328 },
    // Remaining 15
    { code: 'BRYC', lat: 28.3182, lon: 79.4187 },
    { code: 'KNW', lat: 21.8267, lon: 76.3533 },
    { code: 'FZR', lat: 30.9168, lon: 74.6094 },
    { code: 'GDR', lat: 14.1033, lon: 79.8492 },
    { code: 'DUI', lat: 30.2647, lon: 75.8711 },
    { code: 'NAD', lat: 23.4533, lon: 75.4167 },
    { code: 'SIKR', lat: 27.6105, lon: 75.1555 },
    { code: 'ABS', lat: 30.1245, lon: 74.1955 },
    { code: 'BBQ', lat: 13.1000, lon: 80.2700 },
    { code: 'FD', lat: 26.7622, lon: 82.1432 },
    { code: 'BTC', lat: 21.8117, lon: 80.1833 },
    { code: 'COI', lat: 25.3891, lon: 81.8845 },
    { code: 'NRKG', lat: 26.7531, lon: 84.5042 },
    { code: 'MGS', lat: 25.2818, lon: 83.1235 },
    { code: 'IDH', lat: 27.1750, lon: 77.9950 },
    { code: 'DDJ', lat: 22.6220, lon: 88.3888 }
];

async function main() {
    console.log('--- OneRail Final Junction Patch ---');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    for (const p of MANUAL_PATCHES) {
        process.stdout.write(`Patching ${p.code}... `);
        await client.query(`
            UPDATE "Station"
            SET latitude = $1, longitude = $2, is_junction = true
            WHERE station_code = $3
        `, [p.lat, p.lon, p.code]);
        console.log('✅');
    }

    // Verify
    const remaining = await client.query(`
        SELECT COUNT(*) FROM "Station" 
        WHERE is_junction = true AND (latitude IS NULL OR longitude IS NULL)
    `);
    console.log(`\nRemaining junctions with NULL coordinates: ${remaining.rows[0].count}`);

    await client.end();
}

main().catch(console.error);
