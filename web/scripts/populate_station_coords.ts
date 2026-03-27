/**
 * populate_station_coords.ts
 *
 * Scans the OSM PBF file for nodes tagged as railway=station or halt,
 * looks up their 'ref' tag (Indian Railway Code), and updates the 
 * existing Station table rows with their exact [longitude, latitude].
 */

import 'dotenv/config';
import path from 'path';
import { createReadStream } from 'fs';
import OsmPbfParser from 'osm-pbf-parser';
import readline from 'readline';
import { prisma } from '../src/lib/prisma';

const pbfPath = path.join(process.cwd(), '..', 'india-260326.osm.pbf');

function printProgress(msg: string) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(msg);
}

async function main() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 OneRail Atlas — Station Coordinates Importer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const stationCoords = new Map<string, [number, number]>();
    const stationNames = new Map<string, string>();
    let scannedNodes = 0;

    await new Promise((resolve, reject) => {
        const stream = createReadStream(pbfPath);
        const parser = new OsmPbfParser();
        let lastReport = Date.now();

        stream.pipe(parser);
        parser.on('data', (items: any[]) => {
            for (const item of items) {
                if (item.type === 'node') {
                    scannedNodes++;
                    
                    const isStationOrHalt = item.tags?.railway === 'station' || item.tags?.railway === 'halt';
                    const code = item.tags?.ref?.toUpperCase();

                    if (isStationOrHalt && code) {
                        // In case of multiple ref codes separated by comma/slash (e.g. MAS/MMCC)
                        const codes = code.split(/[,/]/).map((c: string) => c.trim());
                        for (const c of codes) {
                            if (c) {
                                stationCoords.set(c, [item.lon, item.lat]);
                                if (item.tags.name) stationNames.set(c, item.tags.name);
                            }
                        }
                    }

                    if (Date.now() - lastReport > 500) {
                        printProgress(`  → Scanned ${scannedNodes.toLocaleString()} nodes... Found ${stationCoords.size} IR station coordinates.`);
                        lastReport = Date.now();
                    }
                }
            }
        });

        parser.on('end', () => {
             printProgress(`  ✓ Done! Scanned ${scannedNodes.toLocaleString()} nodes total.\n  ✓ Collected absolute coordinates for ${stationCoords.size.toLocaleString()} unique IR station codes.\n`);
             resolve(null);
        });
        parser.on('error', reject);
    });

    console.log('\nPopulating PostgreSQL Station table...');
    
    // We already have stations in the DB (since the user previously had them).
    // Let's iterate map and update using Prisma!
    
    let updated = 0;
    let missed = 0;

    const codesToUpdate = Array.from(stationCoords.entries());
    let startTime = Date.now();

    for (let i = 0; i < codesToUpdate.length; i++) {
        const [code, coords] = codesToUpdate[i];
        
        try {
            await prisma.station.upsert({
                where: { station_code: code },
                update: {
                    longitude: coords[0],
                    latitude: coords[1]
                },
                create: {
                    station_code: code,
                    station_name: stationNames.get(code) || `Unknown Station (${code})`,
                    longitude: coords[0],
                    latitude: coords[1]
                }
            });
            updated++;
        } catch (e) {
            missed++;
        }

        if (i % 100 === 0) {
            printProgress(`  → Upserted ${updated} stations... (${missed} skipped)`);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\n✅ Done in ${elapsed}s!`);
    console.log(`   Updated ${updated.toLocaleString()} stations with coordinates.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
