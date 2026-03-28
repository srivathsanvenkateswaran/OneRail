require('dotenv').config();
const { Client } = require('pg');

/**
 * 🗺️ OneRail Global Geography Recovery [Bulk - Native Fetch]
 * Fetches all railway stations in India via Overpass API 
 * and hydrates our NULL stations by Name-matching.
 */
async function main() {
    console.log('--- OneRail Global Geography Recovery [Bulk - Native Fetch] ---');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // 1. Get the list of all problematic stations (Named junctions with NULL coords)
    // We also include major named stations that aren't junctions yet.
    const missingStations = await client.query(`
        SELECT station_code, station_name FROM "Station" 
        WHERE (station_name NOT LIKE 'OSM_%' AND latitude IS NULL)
    `);
    
    if (missingStations.rows.length === 0) {
        console.log('✅ All named stations already have coordinates. No recovery needed!');
        await client.end();
        return;
    }

    console.log(`📡 Identified ${missingStations.rows.length} stations needing recovery.`);
    console.log('🛰️ Querying OpenStreetMap (Overpass API) for all Indian Railway Stations...');

    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = `
        [out:json][timeout:120];
        (
          node["railway"="station"](area["name"="India"]);
        );
        out body;
    `;

    try {
        const response = await fetch(overpassUrl, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`
        });
        
        if (!response.ok) {
            throw new Error(`Overpass API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const osmStations = data.elements || [];
        console.log(`✓ Fetched ${osmStations.length} station nodes from OSM.`);

        // 2. Map OSM nodes by name for fast lookup
        const osmMap = new Map();
        for (const s of osmStations) {
            if (s.tags && s.tags.name) {
                // Key is normalized name (lowercase, no dots, no spaces at ends)
                // Also normalize 'junction' to 'jn' for fuzzy matching
                const key = s.tags.name.toLowerCase()
                    .replace(/\./g, '')
                    .replace(/junction/g, 'jn')
                    .replace(/jct/g, 'jn')
                    .trim();
                osmMap.set(key, { lat: s.lat, lon: s.lon });
            }
        }

        // 3. Match and Update
        console.log('--- Matching & Repairing ---');
        let recovered = 0;
        for (const row of missingStations.rows) {
            const searchKey = row.station_name.toLowerCase()
                .replace(/\./g, '')
                .replace(/junction/g, 'jn')
                .replace(/jct/g, 'jn')
                .trim();
            const match = osmMap.get(searchKey);

            if (match) {
                await client.query(`
                    UPDATE "Station"
                    SET latitude = $1, longitude = $2
                    WHERE station_code = $3
                `, [match.lat, match.lon, row.station_code]);
                recovered++;
                if (recovered % 25 === 0) {
                    process.stdout.write('.');
                }
            }
        }

        console.log(`\n\n✅ RECOVERY COMPLETE!`);
        console.log(`   Successfully salvaged coords for ${recovered} of ${missingStations.rows.length} missing stations.`);

    } catch (err) {
        console.error('❌ Overpass API or Update error:', err.message);
    }

    await client.end();
}

main().catch(console.error);
