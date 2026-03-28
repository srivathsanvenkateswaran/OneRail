require('dotenv').config();
const { Client } = require('pg');

const PATCHES = [
    { code: 'MDU', name: 'Madurai Jn', lat: 9.9208, lon: 78.1105 },
    { code: 'KPD', name: 'Katpadi Jn', lat: 12.9691, lon: 79.1328 },
    { code: 'MYS', name: 'Mysuru Jn', lat: 12.3168, lon: 76.6450 },
    { code: 'PAU', name: 'Purna Jn', lat: 19.1764, lon: 77.0270 },
    { code: 'TJ',  name: 'Thanjavur Jn', lat: 10.7711, lon: 79.1235 },
    { code: 'TEN', name: 'Tirunelveli Jn', lat: 8.7188, lon: 77.6961 }
];

async function main() {
    console.log('--- OneRail Station Geography Patch [v1] ---');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    for (const p of PATCHES) {
        process.stdout.write(`Patching ${p.code} (${p.name})... `);
        
        // Ensure station exists + update coordinates + force is_junction
        await client.query(`
            UPDATE "Station"
            SET latitude = $1, longitude = $2, is_junction = true
            WHERE station_code = $3;
        `, [p.lat, p.lon, p.code]);
        
        console.log('✅ FIXED');
    }

    await client.end();
}

main().catch(console.error);
