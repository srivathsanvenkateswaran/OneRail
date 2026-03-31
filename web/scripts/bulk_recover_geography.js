require('dotenv').config();
const { Client } = require('pg');

/**
 * 🗺️ OneRail Global Geography Recovery [Bulk - Native Fetch]
 * Fetches all railway stations in India via Overpass API 
 * and hydrates our NULL stations by Name-matching.
 */

// Manual high-priority patches for confirmed missing junctions
const MANUAL_PATCHES = [
    { code: 'TEL', name: 'Tenali Jn', lat: 16.2415, lon: 80.6455 },
    { code: 'BSB', name: 'Varanasi Jn', lat: 25.3284, lon: 82.9902 },
    { code: 'CBE', name: 'Coimbatore Jn', lat: 10.9996, lon: 76.9654 },
    { code: 'MAO', name: 'Madgaon Jn', lat: 15.2731, lon: 73.9698 },
    { code: 'KPD', name: 'Katpadi Jn', lat: 12.9691, lon: 79.1328 }, // Ensure it's active
];

async function main() {
    console.log('--- OneRail Global Geography Recovery [Bulk - Native Fetch] ---');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // 0. Apply Manual Patches First
    console.log('Applying manual junction patches...');
    for (const p of MANUAL_PATCHES) {
        await client.query(`
            UPDATE "Station"
            SET latitude = $1, longitude = $2, is_junction = true
            WHERE station_code = $3
        `, [p.lat, p.lon, p.code]);
    }

    // 1. Get the list of all problematic stations (Named junctions with NULL coords)
    const missingStations = await client.query(`
        SELECT station_code, station_name FROM "Station" 
        WHERE (station_name NOT LIKE 'OSM_%' AND latitude IS NULL)
    `);
    
    if (missingStations.rows.length === 0) {
        console.log('✅ All named stations already have coordinates. No further recovery needed!');
        await client.end();
        return;
    }

    console.log(`📡 Identified ${missingStations.rows.length} stations needing recovery.`);
    console.log('🛰️ Querying OpenStreetMap (Overpass API) for all Indian Railway Stations...');

    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = `
        [out:json][timeout:180];
        (
          node["railway"~"station|halt"](6.5,68.1,35.5,97.4);
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

        // 2. Map OSM nodes by ref (code) and name for fast lookup
        const osmRefMap = new Map();
        const osmNameMap = new Map();

        const normalize = (name) => {
            return name.toLowerCase()
                .replace(/\./g, '')
                .replace(/\bjunction\b/g, '')
                .replace(/\bjn\b/g, '')
                .replace(/\bjct\b/g, '')
                .replace(/\bcantt\b/g, 'cantonment')
                .replace(/\s+/g, ' ')
                .trim();
        };

        for (const s of osmStations) {
            if (s.tags) {
                if (s.tags.ref) {
                    const codes = s.tags.ref.toUpperCase().split(/[,/]/).map(c => c.trim());
                    for (const c of codes) {
                        if (c) osmRefMap.set(c, { lat: s.lat, lon: s.lon });
                    }
                }
                if (s.tags.name) {
                    const key = normalize(s.tags.name);
                    osmNameMap.set(key, { lat: s.lat, lon: s.lon });
                }
                if (s.tags['name:en']) {
                    const key = normalize(s.tags['name:en']);
                    osmNameMap.set(key, { lat: s.lat, lon: s.lon });
                }
            }
        }

        // 3. Match and Update
        console.log('--- Matching & Repairing ---');
        let recovered = 0;
        for (const row of missingStations.rows) {
            // Priority 1: Match by Code (ref)
            let match = osmRefMap.get(row.station_code);
            
            // Priority 2: Match by Name
            if (!match) {
                const searchKey = normalize(row.station_name);
                match = osmNameMap.get(searchKey);
            }

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
