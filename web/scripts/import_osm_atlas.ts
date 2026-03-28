import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';

async function importOSM(filename: string) {
    const absPath = path.resolve(filename);
    console.log(`Reading OSM data from ${absPath}`);
    const data = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
    const nodesMap = new Map<number, [number, number]>();
    const elements = data.elements;

    // 1. Map all nodes for fast lookup
    for (const el of elements) {
        if (el.type === 'node') {
            nodesMap.set(el.id, [el.lon, el.lat]);
        }
    }

    console.log(`Nodes loaded: ${nodesMap.size}, Total elements: ${elements.length}`);
    let trackCount = 0;
    let wayCount = 0;
    let firstError: any = null;

    for (const el of elements) {
        if (el.type === 'way' && el.tags?.railway === 'rail') {
            wayCount++;
            const path_coords = (el.nodes as number[])
                .map((nodeId: number) => nodesMap.get(nodeId))
                .filter((coord): coord is [number, number] => !!coord);

            if (path_coords.length < 2) continue;

            // 1435mm = standard gauge used by metro systems (Chennai Metro, Delhi Metro, etc.)
            // Indian Railways mainline uses 1676mm (BG), 1000mm (MG), 762/610mm (NG) — never 1435mm.
            if (el.tags?.gauge === '1435') continue;

            const gauge = el.tags?.gauge === '1676' ? 'BG' :
                el.tags?.gauge === '1000' ? 'MG' :
                    (el.tags?.gauge === '762' || el.tags?.gauge === '610') ? 'NG' : 'BG';

            const electrified = el.tags?.electrified === 'contact_line' || el.tags?.electrified === 'yes';
            const status = (el.tags?.usage === 'construction' || el.tags?.construction) ? 'Under Construction' : 'Operational';
            const trackType = el.tags?.tracks === '2' ? 'Double' : el.tags?.tracks === '1' ? 'Single' : 'Multi';

            const fromNodeId = el.nodes[0];
            const toNodeId = el.nodes[el.nodes.length - 1];
            const fromCode = `OSM_${fromNodeId}`;
            const toCode = `OSM_${toNodeId}`;

            try {
                const fromCoord = nodesMap.get(fromNodeId);
                const toCoord = nodesMap.get(toNodeId);
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
                    where: { from_station_code_to_station_code: { from_station_code: fromCode, to_station_code: toCode } },
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
                if (trackCount % 100 === 0) console.log(`  Imported ${trackCount} tracks...`);
            } catch (e: any) {
                if (!firstError) {
                    firstError = e;
                    console.error(`⚠️ FIRST ERROR (way ${el.id} from ${fromCode} to ${toCode}):`);
                    console.error(e.message);
                }
            }
        }
    }
    console.log(`\nDone: imported ${trackCount} / ${wayCount} track segments.`);
    if (firstError && trackCount === 0) {
        console.error('\nFull first error:');
        console.error(firstError);
    }
}

const defaultFile = path.join(process.cwd(), '..', '.tmp', 'osm_railways_28.5_77.1_28.7_77.3.json');
const file = process.argv[2] || defaultFile;
importOSM(file).catch(console.error).finally(() => prisma.$disconnect());
