/**
 * merge_and_import_osm.mjs
 *
 * Reads all tile JSON files from tools/.tmp/india_tiles/,
 * deduplicates OSM ways by ID across tile boundaries,
 * and bulk-imports them into the Prisma DB.
 *
 * Usage:
 *   node tools/merge_and_import_osm.mjs
 *
 * Run AFTER: node tools/scrape_india_osm.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TILES_DIR = path.join(__dirname, '.tmp', 'india_tiles');
const prisma = new PrismaClient();

// ── 1. Load & Merge all tiles ────────────────────────────────────────────────

async function loadAllTiles() {
    const files = fs.readdirSync(TILES_DIR).filter(f => f.endsWith('.json'));
    console.log(`\n📂 Found ${files.length} tile files.`);

    const allNodes = new Map(); // nodeId → [lon, lat]
    const allWays = new Map();  // wayId → element (deduplicate across tiles)

    for (const file of files) {
        const raw = fs.readFileSync(path.join(TILES_DIR, file), 'utf-8');
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            console.warn(`  ⚠️  Skipping unreadable file: ${file}`);
            continue;
        }

        for (const el of data.elements) {
            if (el.type === 'node') {
                allNodes.set(el.id, [el.lon, el.lat]);
            } else if (el.type === 'way') {
                allWays.set(el.id, el); // last-write wins (same way, same data)
            }
        }
    }

    console.log(`  → Unique nodes: ${allNodes.size.toLocaleString()}`);
    console.log(`  → Unique ways:  ${allWays.size.toLocaleString()}`);
    return { allNodes, allWays };
}

// ── 2. Import to DB ──────────────────────────────────────────────────────────

async function importToDB(allNodes, allWays) {
    const ways = Array.from(allWays.values());
    let trackCount = 0;
    let wayCount = 0;
    let skipCount = 0;
    let firstError = null;

    console.log(`\n🚂 Importing ${ways.length.toLocaleString()} ways into DB...`);
    console.log(`(This will take a while — ~3 DB ops per way)`);

    for (const el of ways) {
        const railTag = el.tags?.railway;

        // Only import actual rail tracks (not platforms, level_crossings, etc.)
        if (railTag !== 'rail' && railTag !== 'construction') {
            skipCount++;
            continue;
        }

        wayCount++;

        const nodeIds = el.nodes as number[] || el.nodes;
        const path_coords = nodeIds
            .map(nid => allNodes.get(nid))
            .filter(coord => !!coord);

        if (path_coords.length < 2) continue;

        const gauge = el.tags?.gauge === '1676' ? 'BG' :
            el.tags?.gauge === '1000' ? 'MG' :
                (el.tags?.gauge === '762' || el.tags?.gauge === '610') ? 'NG' : 'BG';

        const electrified = el.tags?.electrified === 'contact_line' ||
            el.tags?.electrified === 'yes' ||
            el.tags?.electrified === 'rail';

        const isConstruction = railTag === 'construction' ||
            el.tags?.usage === 'construction' ||
            !!el.tags?.construction;
        const status = isConstruction ? 'Under Construction' : 'Operational';

        const tracksTag = el.tags?.tracks;
        const trackType = tracksTag === '2' ? 'Double' :
            tracksTag === '1' ? 'Single' :
                (tracksTag && parseInt(tracksTag) > 2) ? 'Multi' : 'Single';

        const fromNodeId = nodeIds[0];
        const toNodeId = nodeIds[nodeIds.length - 1];
        const fromCode = `OSM_${fromNodeId}`;
        const toCode = `OSM_${toNodeId}`;

        try {
            const fromCoord = allNodes.get(fromNodeId);
            const toCoord = allNodes.get(toNodeId);
            if (!fromCoord || !toCoord) continue;

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
                update: {
                    path_coordinates: path_coords,
                    gauge,
                    electrified,
                    status,
                    track_type: trackType
                },
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

            trackCount++;
            if (trackCount % 500 === 0) {
                console.log(`  ✓ ${trackCount.toLocaleString()} / ${wayCount.toLocaleString()} tracks imported...`);
            }

        } catch (e) {
            if (!firstError) {
                firstError = e;
                console.error(`\n⚠️  First error on way ${el.id} (${fromCode} → ${toCode}):`);
                console.error(e.message);
            }
        }
    }

    return { trackCount, wayCount, skipCount };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗺️  OSM Atlas — Merge & Import');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!fs.existsSync(TILES_DIR)) {
        console.error(`\n❌ Tiles directory not found: ${TILES_DIR}`);
        console.error('Run scrape_india_osm.mjs first.');
        process.exit(1);
    }

    const { allNodes, allWays } = await loadAllTiles();

    if (allWays.size === 0) {
        console.error('\n❌ No ways found. Check tile files.');
        process.exit(1);
    }

    const start = Date.now();
    const { trackCount, wayCount } = await importToDB(allNodes, allWays);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Import complete in ${elapsed}s`);
    console.log(`   Track segments imported: ${trackCount.toLocaleString()} / ${wayCount.toLocaleString()} ways`);
    console.log(`\nNext: start the web app and visit /atlas`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
