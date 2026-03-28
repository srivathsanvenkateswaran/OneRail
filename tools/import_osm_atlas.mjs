import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function importOSM(filename) {
    const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    const nodesMap = new Map();
    const elements = data.elements;

    // 1. Map all nodes for fast lookup
    for (const el of elements) {
        if (el.type === 'node') {
            nodesMap.set(el.id, [el.lon, el.lat]);
        }
    }

    console.log(`Processing ${elements.length} OSM elements...`);
    let trackCount = 0;

    for (const el of elements) {
        // Handle Railway Tracks (Ways)
        if (el.type === 'way' && el.tags?.railway === 'rail') {
            const path = el.nodes.map(nodeId => nodesMap.get(nodeId)).filter(coord => !!coord);
            if (path.length < 2) continue;

            // 1435mm = standard gauge used by metro systems (Chennai Metro, Delhi Metro, etc.)
            // Indian Railways mainline uses 1676mm (BG), 1000mm (MG), 762/610mm (NG) — never 1435mm.
            if (el.tags?.gauge === '1435') continue;

            const gauge = el.tags?.gauge === '1676' ? 'BG' :
                el.tags?.gauge === '1000' ? 'MG' :
                    el.tags?.gauge === '762' || el.tags?.gauge === '610' ? 'NG' : 'BG';

            const electrified = el.tags?.electrified === 'contact_line' || el.tags?.electrified === 'yes';
            const status = el.tags?.usage === 'construction' ? 'Under Construction' : 'Operational';
            const trackType = el.tags?.tracks === '2' ? 'Double' : el.tags?.tracks === '1' ? 'Single' : 'Multi';

            // We generate a surrogate ID or name if from/to station codes are unknown
            // For Atlas, we often store segments by OSM ID to avoid duplication
            try {
                // Since our TrackSegment schema requires station codes, we will:
                // a) Try to find nodes that have station names
                // b) Create dummy/virtual nodes for intermediate junctions

                // For this V1 Atlas Ingest, we'll store them as segments linked to virtual codes 
                // OR adapt the schema to be fully geographic (standalone ways).
                // Let's create a Virtual Station for OSM Nodes that aren't in our DB yet.

                const fromNodeId = el.nodes[0];
                const toNodeId = el.nodes[el.nodes.length - 1];
                const fromCode = `OSM_${fromNodeId}`;
                const toCode = `OSM_${toNodeId}`;

                // Ensure virtual stations exist
                await prisma.station.upsert({
                    where: { station_code: fromCode },
                    update: {},
                    create: {
                        station_code: fromCode,
                        station_name: `Junction ${fromNodeId}`,
                        latitude: nodesMap.get(fromNodeId)[1],
                        longitude: nodesMap.get(fromNodeId)[0],
                        is_junction: true
                    }
                });

                await prisma.station.upsert({
                    where: { station_code: toCode },
                    update: {},
                    create: {
                        station_code: toCode,
                        station_name: `Junction ${toNodeId}`,
                        latitude: nodesMap.get(toNodeId)[1],
                        longitude: nodesMap.get(toNodeId)[0],
                        is_junction: true
                    }
                });

                await prisma.trackSegment.upsert({
                    where: { from_station_code_to_station_code: { from_station_code: fromCode, to_station_code: toCode } },
                    update: {
                        path_coordinates: path,
                        gauge,
                        electrified,
                        status,
                        track_type: trackType
                    },
                    create: {
                        from_station_code: fromCode,
                        to_station_code: toCode,
                        path_coordinates: path,
                        gauge,
                        electrified,
                        status,
                        track_type: trackType
                    }
                });
                trackCount++;
            } catch (e) {
                // Skip if duplicate or err
            }
        }
    }
    console.log(`Successfully imported ${trackCount} track segments.`);
}

const file = process.argv[2] || '.tmp/osm_railways_28.5_77.1_28.7_77.3.json';
importOSM(file).catch(console.error).finally(() => prisma.$disconnect());
