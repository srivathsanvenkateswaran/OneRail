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
    console.log('🔄 OneRail Atlas — Network Reconciliation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const osmToCode = new Map<string, string>();
    const codeToName = new Map<string, string>();
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
                        const codes = code.split(/[,/]/).map((c: string) => c.trim());
                        for (const c of codes) {
                            if (c && c.length >= 2 && c.length <= 5) {
                                osmToCode.set(`OSM_${item.id}`, c);
                                if (item.tags.name) {
                                    codeToName.set(c, item.tags.name);
                                }
                            }
                        }
                    }

                    if (Date.now() - lastReport > 500) {
                        printProgress(`  → Scanned ${scannedNodes.toLocaleString()} nodes... Found ${osmToCode.size} mappings.`);
                        lastReport = Date.now();
                    }
                }
            }
        });

        parser.on('end', () => {
             printProgress(`  ✓ Done! Scanned ${scannedNodes.toLocaleString()} nodes total.\n  ✓ Identified ${osmToCode.size.toLocaleString()} hub-to-station mappings.\n`);
             resolve(null);
        });
        parser.on('error', reject);
    });

    console.log('\nApplying remapping to TrackSegments (Phase 1: from_station_code)...');
    let updatedFrom = 0;
    const mappings = Array.from(osmToCode.entries());
    
    for (let i = 0; i < mappings.length; i++) {
        const [osm, code] = mappings[i];
        
        // Ensure station exists first (create it if missing from IR source but present in OSM)
        const name = codeToName.get(code) || `Unknown Station (${code})`;
        const displayName = name.includes(`(${code})`) ? name : `${name} (${code})`;

        try {
            // Check if real station exists
            let station = await prisma.station.findUnique({ where: { station_code: code } });
            if (!station) {
                const osmStation = await prisma.station.findUnique({ where: { station_code: osm } });
                await prisma.station.create({
                    data: {
                        station_code: code,
                        station_name: displayName,
                        latitude: osmStation?.latitude,
                        longitude: osmStation?.longitude
                    }
                });
            } else {
                // Update name to include code if not already
                if (!station.station_name.includes(`(${code})`)) {
                    await prisma.station.update({
                        where: { station_code: code },
                        data: { station_name: displayName }
                    });
                }
            }

            // Update TrackSegments referencing this OSM hub
            const resFrom = await prisma.trackSegment.updateMany({
                where: { from_station_code: osm },
                data: { from_station_code: code }
            });
            updatedFrom += resFrom.count;
            
        } catch (e) {}

        if (i % 50 === 0) printProgress(`  → Remapping tracks: ${((i/mappings.length)*100).toFixed(1)}%...`);
    }
    console.log(`\n  ✓ Updated ${updatedFrom} 'from' references.`);

    console.log('\nApplying remapping to TrackSegments (Phase 2: to_station_code)...');
    let updatedTo = 0;
    for (let i = 0; i < mappings.length; i++) {
        const [osm, code] = mappings[i];
        try {
            const resTo = await prisma.trackSegment.updateMany({
                where: { to_station_code: osm },
                data: { to_station_code: code }
            });
            updatedTo += resTo.count;
        } catch (e) {}
        if (i % 50 === 0) printProgress(`  → Remapping tracks: ${((i/mappings.length)*100).toFixed(1)}%...`);
    }
    console.log(`\n  ✓ Updated ${updatedTo} 'to' references.`);

    console.log('\nFinal cleanup: Deleting redundant OSM virtual hubs...');
    let deleted = 0;
    for (let i = 0; i < mappings.length; i++) {
        const [osm] = mappings[i];
        try {
            const d = await prisma.station.delete({ where: { station_code: osm } });
            if (d) deleted++;
        } catch (e) {}
    }
    console.log(`  ✓ Purged ${deleted} redundant stations.`);
    
    console.log('\n🚀 Reconciliation complete! Please re-run npx tsx scripts/generate_sections.ts to rebuild logical corridors.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
