/**
 * import_pbf_atlas.mjs
 *
 * Reads a Geofabrik OSM PBF file and imports all railway=rail ways
 * directly into the Prisma DB — no osmium or system tools needed.
 *
 * Prerequisites:
 *   1. Download India OSM dump (one-time, ~500MB):
 *      https://download.geofabrik.de/asia/india-latest.osm.pbf
 *      Save it to: tools/.tmp/india-latest.osm.pbf
 *
 *   2. Run this script:
 *      node tools/import_pbf_atlas.mjs
 *      (or pass a custom path: node tools/import_pbf_atlas.mjs path/to/file.osm.pbf)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import OsmPbfParser from 'osm-pbf-parser';
import PrismaPkg from '../web/node_modules/@prisma/client/index.js';
const { PrismaClient } = PrismaPkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const DEFAULT_PBF = path.join(__dirname, '.tmp', 'india-latest.osm.pbf');
const pbfPath = path.resolve(process.argv[2] || DEFAULT_PBF);

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyGauge(tags) {
    if (!tags?.gauge) return 'BG'; // default to BG if unknown
    if (tags.gauge === '1676') return 'BG';
    if (tags.gauge === '1000') return 'MG';
    if (tags.gauge === '762' || tags.gauge === '610') return 'NG';
    return 'BG';
}

function classifyStatus(tags) {
    if (!tags) return 'Operational';
    if (
        tags.railway === 'construction' ||
        tags.construction === 'rail' ||
        tags.usage === 'construction'
    ) return 'Under Construction';
    return 'Operational';
}

function classifyTrackType(tags) {
    const t = tags?.tracks;
    if (!t) return 'Single';
    const n = parseInt(t);
    if (n === 1) return 'Single';
    if (n === 2) return 'Double';
    if (n > 2) return 'Multi';
    return 'Single';
}

function isElectrified(tags) {
    return tags?.electrified === 'contact_line' ||
        tags?.electrified === 'yes' ||
        tags?.electrified === 'rail';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    if (!fs.existsSync(pbfPath)) {
        console.error(`\n❌ PBF file not found: ${pbfPath}`);
        console.error('\nDownload it first:');
        console.error('  https://download.geofabrik.de/asia/india-latest.osm.pbf');
        console.error(`  → Save to: ${DEFAULT_PBF}\n`);
        process.exit(1);
    }

    const fileSizeMB = (fs.statSync(pbfPath).size / 1024 / 1024).toFixed(1);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗺️  OneRail Atlas — PBF Importer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📁 File: ${pbfPath} (${fileSizeMB} MB)`);
    console.log('\nPhase 1: Parsing PBF into memory...');

    // Two-pass: first collect all nodes, then filter railway ways
    const nodes = new Map();   // nodeId → [lon, lat]
    const ways = new Map();    // wayId → element

    let nodeCount = 0;
    let wayCount = 0;

    await new Promise((resolve, reject) => {
        const parser = new OsmPbfParser();
        const stream = createReadStream(pbfPath);

        stream.pipe(parser);

        parser.on('data', (items) => {
            for (const item of items) {
                if (item.type === 'node') {
                    nodes.set(item.id, [item.lon, item.lat]);
                    nodeCount++;
                } else if (item.type === 'way') {
                    const railway = item.tags?.railway;
                    if (railway === 'rail' || railway === 'construction') {
                        ways.set(item.id, item);
                        wayCount++;
                    }
                }
            }
        });

        parser.on('end', resolve);
        parser.on('error', reject);

        // Progress dots
        let dots = 0;
        const progressInterval = setInterval(() => {
            process.stdout.write('.');
            dots++;
            if (dots % 60 === 0) {
                process.stdout.write(`\n  nodes: ${(nodeCount / 1e6).toFixed(1)}M  ways: ${wayCount.toLocaleString()}\n`);
            }
        }, 1000);

        parser.on('end', () => clearInterval(progressInterval));
    });

    console.log(`\n\n✅ Parsed: ${(nodeCount / 1e6).toFixed(1)}M nodes, ${wayCount.toLocaleString()} railway ways`);

    // ── Phase 2: Import to DB ────────────────────────────────────────────────
    console.log('\nPhase 2: Importing to database...');
    console.log('  (3 DB ops per way — this takes a few minutes)\n');

    const wayList = Array.from(ways.values());
    let imported = 0;
    let skipped = 0;
    let firstError = null;
    const startTime = Date.now();

    for (let i = 0; i < wayList.length; i++) {
        const el = wayList[i];

        const nodeIds = el.refs || el.nodes || [];
        const path_coords = nodeIds
            .map(nid => nodes.get(nid))
            .filter(c => !!c);

        if (path_coords.length < 2) { skipped++; continue; }

        const fromNodeId = nodeIds[0];
        const toNodeId = nodeIds[nodeIds.length - 1];
        const fromCoord = nodes.get(fromNodeId);
        const toCoord = nodes.get(toNodeId);
        if (!fromCoord || !toCoord) { skipped++; continue; }

        const fromCode = `OSM_${fromNodeId}`;
        const toCode = `OSM_${toNodeId}`;
        const gauge = classifyGauge(el.tags);
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
            if (imported % 500 === 0) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                const pct = ((i / wayList.length) * 100).toFixed(1);
                console.log(`  ✓ ${imported.toLocaleString()} imported  [${pct}% — ${elapsed}s elapsed]`);
            }

        } catch (e) {
            if (!firstError) {
                firstError = e;
                console.error(`\n⚠️  First error on way ${el.id}:`);
                console.error(e.message);
            }
            skipped++;
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Done in ${totalTime}s`);
    console.log(`   Imported: ${imported.toLocaleString()} track segments`);
    console.log(`   Skipped:  ${skipped.toLocaleString()} (missing coords or errors)`);
    console.log(`\n🚀 Start the app and visit /atlas to see the full network!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
