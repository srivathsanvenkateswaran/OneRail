import 'dotenv/config';
/**
 * import_pbf_atlas.ts
 *
 * Imports India OSM dump directly into DB.
 * Uses a memory-efficient 2-pass streaming parser to avoid loading all 1.6GB into memory.
 */

import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import OsmPbfParser from 'osm-pbf-parser';
import { prisma } from '../src/lib/prisma';
import readline from 'readline';

const DEFAULT_PBF = path.join(process.cwd(), '..', 'india-260326.osm.pbf');
const pbfPath = path.resolve(process.argv[2] || DEFAULT_PBF);

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyGauge(tags: any) {
    if (!tags?.gauge) return 'BG'; // default to BG if unknown
    if (tags.gauge === '1676') return 'BG';
    if (tags.gauge === '1000') return 'MG';
    if (tags.gauge === '762' || tags.gauge === '610') return 'NG';
    // 1435mm = standard gauge — used by metro/rapid transit in India, NOT Indian Railways mainline.
    // Returning null signals the caller to skip this way entirely.
    if (tags.gauge === '1435') return null;
    return 'BG';
}

function classifyStatus(tags: any) {
    if (!tags) return 'Operational';
    if (
        tags.railway === 'construction' ||
        tags.construction === 'rail' ||
        tags.usage === 'construction'
    ) return 'Under Construction';
    return 'Operational';
}

function classifyTrackType(tags: any) {
    const t = tags?.tracks;
    if (!t) return 'Single';
    const n = parseInt(t);
    if (n === 1) return 'Single';
    if (n === 2) return 'Double';
    if (n > 2) return 'Multi';
    return 'Single';
}

function isElectrified(tags: any) {
    return tags?.electrified === 'contact_line' ||
        tags?.electrified === 'yes' ||
        tags?.electrified === 'rail';
}

function printProgress(msg: string) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(msg);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    if (!fs.existsSync(pbfPath)) {
        console.error(`\n❌ PBF file not found: ${pbfPath}`);
        process.exit(1);
    }

    const fileSizeMB = (fs.statSync(pbfPath).size / 1024 / 1024).toFixed(1);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗺️  OneRail Atlas — PBF memory-optimized Importer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📁 File: ${pbfPath} (${fileSizeMB} MB)`);

    // ── Phase 1 ──────────────────────────────────────────────────────────────
    console.log('\n[1/3] Phase 1/2: Sweeping ways to find railway track node IDs...');
    
    // We'll store node IDs required by train tracks, and the ways themselves to save time.
    const neededNodeIds = new Set<number>();
    const railwayWays: any[] = [];
    
    let scannedWays = 0;
    
    await new Promise((resolve, reject) => {
        const stream = createReadStream(pbfPath);
        const parser = new OsmPbfParser();
        
        let lastReport = Date.now();

        stream.pipe(parser);
        parser.on('data', (items: any[]) => {
            for (const item of items) {
                if (item.type === 'way') {
                    scannedWays++;
                    
                    const railway = item.tags?.railway;
                    if (railway === 'rail' || railway === 'construction') {
                        railwayWays.push(item);
                        // Add all nodes building this way into the needed set
                        const refs = item.refs || item.nodes || [];
                        for (const r of refs) {
                            neededNodeIds.add(r);
                        }
                    }

                    if (Date.now() - lastReport > 500) {
                        printProgress(`  → Scanned ${scannedWays.toLocaleString()} ways... Found ${railwayWays.length.toLocaleString()} tracks and ${neededNodeIds.size.toLocaleString()} nodes.`);
                        lastReport = Date.now();
                    }
                }
            }
        });

        parser.on('end', () => {
            printProgress(`  ✓ Done! Scanned ${scannedWays.toLocaleString()} ways total. Found ${railwayWays.length.toLocaleString()} track ways and ${neededNodeIds.size.toLocaleString()} needed nodes.\n`);
            resolve(null);
        });
        parser.on('error', reject);
    });

    if (railwayWays.length === 0) {
        console.log("❌ Found 0 railway ways in the file, exiting.");
        process.exit(1);
    }

    // ── Phase 2 ──────────────────────────────────────────────────────────────
    console.log('\n[2/3] Phase 2/2: Extracting coords ONLY for needed nodes...');
    
    const nodeCoords = new Map<number, [number, number]>();
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
                    if (neededNodeIds.has(item.id)) {
                        nodeCoords.set(item.id, [item.lon, item.lat]);
                    }

                    if (Date.now() - lastReport > 500) {
                        printProgress(`  → Scanned ${scannedNodes.toLocaleString()} nodes... Extracted ${nodeCoords.size.toLocaleString()} matching coords.`);
                        lastReport = Date.now();
                    }
                }
            }
        });

        parser.on('end', () => {
             printProgress(`  ✓ Done! Scanned ${scannedNodes.toLocaleString()} nodes total. Retained ${nodeCoords.size.toLocaleString()} required node coordinates.\n`);
             resolve(null);
        });
        parser.on('error', reject);
    });

    // ── Phase 3 ──────────────────────────────────────────────────────────────
    console.log('\n[3/3] Importing tracks to PostgreSQL...');
    
    let imported = 0;
    let skipped = 0;
    let firstError: any = null;
    const startTime = Date.now();
    let lastLogTime = Date.now();

    for (let i = 0; i < railwayWays.length; i++) {
        const el = railwayWays[i];

        const nodeIds = el.refs || el.nodes || [];
        const path_coords = nodeIds
            .map((nid: any) => nodeCoords.get(nid))
            .filter((c: any) => !!c);

        if (path_coords.length < 2) { skipped++; continue; }

        const fromNodeId = nodeIds[0];
        const toNodeId = nodeIds[nodeIds.length - 1];
        const fromCoord = nodeCoords.get(fromNodeId);
        const toCoord = nodeCoords.get(toNodeId);
        if (!fromCoord || !toCoord) { skipped++; continue; }

        const fromCode = `OSM_${fromNodeId}`;
        const toCode = `OSM_${toNodeId}`;
        const gauge = classifyGauge(el.tags);
        if (!gauge) { skipped++; continue; } // null = standard gauge (metro) — skip
        const status = classifyStatus(el.tags);
        const trackType = classifyTrackType(el.tags);
        const electrified = isElectrified(el.tags);

        try {
            await prisma.station.upsert({
                where: { station_code: fromCode },
                update: {},
                create: {
                    station_code: fromCode,
                    station_name: `Virtual Hub ${fromNodeId}`,
                    latitude: fromCoord[1],
                    longitude: fromCoord[0],
                    is_junction: true
                }
            });

            await prisma.station.upsert({
                where: { station_code: toCode },
                update: {},
                create: {
                    station_code: toCode,
                    station_name: `Virtual Hub ${toNodeId}`,
                    latitude: toCoord[1],
                    longitude: toCoord[0],
                    is_junction: true
                }
            });

            await prisma.trackSegment.upsert({
                where: {
                    from_station_code_to_station_code: {
                        from_station_code: fromCode,
                        to_station_code: toCode
                    }
                },
                update: { path_coordinates: path_coords, gauge, electrified, status, track_type: trackType },
                create: {
                    from_station_code: fromCode,
                    to_station_code: toCode,
                    path_coordinates: path_coords,
                    gauge,
                    electrified,
                    status,
                    track_type: trackType
                }
            });

            imported++;
            
            // Log progress every 100 tracks or 1s
            if (imported % 10 === 0 || Date.now() - lastLogTime > 500) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                const pct = ((i / railwayWays.length) * 100).toFixed(1);
                printProgress(`  → Progress: ${pct}%. Imported ${imported.toLocaleString()} ways, skipped ${skipped.toLocaleString()} [${elapsed}s elapsed]\r`);
                lastLogTime = Date.now();
            }

        } catch (e: any) {
            if (!firstError) {
                firstError = e;
                console.error(`\n⚠️  First error on way ${el.id}:`);
                console.error(e.message);
            }
            skipped++;
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Success! Database import finalized in ${totalTime}s.`);
    console.log(`   Imported: ${imported.toLocaleString()} track segments`);
    console.log(`   Skipped:  ${skipped.toLocaleString()} (missing coords or errors)`);
    console.log(`\n🚀 Start the app and visit /atlas to see the full network!`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
