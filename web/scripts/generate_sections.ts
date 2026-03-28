import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// ── Helpers ────────────────────────────────────────────────────────────────

function getHaversineDistance(coords: any[]) {
    if (!coords || !Array.isArray(coords) || coords.length < 2) return 0;

    let totalD = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i];
        const [lon2, lat2] = coords[i+1];
        if (typeof lat1 !== 'number' || typeof lat2 !== 'number') continue;

        const R = 6371;
        const dLat = (lat2-lat1) * Math.PI / 180;
        const dLon = (lon2-lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        totalD += R * c;
    }
    return totalD;
}

function renderProgressBar(current: number, total: number, label: string) {
    const width = 30;
    const progress = Math.min(Math.max(current / total, 0), 1);
    const filledWidth = Math.round(width * progress);
    const emptyWidth = width - filledWidth;
    const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
    const pct = (progress * 100).toFixed(1);
    process.stdout.write(`   ${label}: [${bar}] ${pct}% (${current}/${total})\r`);
}

function elapsed(ms: number) {
    return `${(ms / 1000).toFixed(1)}s`;
}

function ts() {
    return new Date().toLocaleTimeString();
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    const startTime = Date.now();
    const skipClear = process.argv.includes('--skip-clear');

    console.log('\n========================================');
    console.log('   ONERAIL SECTION GENERATOR [v5]');
    console.log('   Starting at: ' + ts());
    if (skipClear) console.log('   Mode: --skip-clear (existing sections kept)');
    console.log('========================================\n');

    // ── Step 1: Clear existing sections ──────────────────────────────────
    if (skipClear) {
        console.log('Step 1: Skipped (--skip-clear flag set).\n');
    } else {
        console.log('Step 1: Clearing existing track sections...');
        const step1Start = Date.now();

        console.log(`   [${ts()}] Nulling track_section_id on all TrackSegments...`);
        const nullResult = await prisma.$executeRawUnsafe('UPDATE "TrackSegment" SET "track_section_id" = NULL');
        console.log(`   [${ts()}] Nulled FK on ${nullResult} rows. (${elapsed(Date.now() - step1Start)})`);

        console.log(`   [${ts()}] Deleting all TrackSection rows...`);
        const deleteStart = Date.now();
        await prisma.$executeRawUnsafe('DELETE FROM "TrackSection"');
        console.log(`   [${ts()}] Deleted in ${elapsed(Date.now() - deleteStart)}.`);

        console.log(`   [${ts()}] Resetting TrackSection ID sequence...`);
        await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"TrackSection"', 'id'), 1, false)`);

        console.log(`   Step 1 complete in ${elapsed(Date.now() - step1Start)}.\n`);
    }

    // ── Step 2: Load segments ─────────────────────────────────────────────
    console.log('Step 2: Loading track segments into memory...');
    const step2Start = Date.now();

    const segments = await prisma.trackSegment.findMany({
        select: {
            id: true,
            from_station_code: true,
            to_station_code: true,
            distance_km: true,
            track_type: true,
            electrified: true,
            gauge: true,
            status: true,
            zone_code: true,
            path_coordinates: true
        }
    });
    console.log(`   Loaded ${segments.length} segments in ${elapsed(Date.now() - step2Start)}.`);

    const withCoords = segments.filter(s => s.path_coordinates && Array.isArray(s.path_coordinates) && (s.path_coordinates as any[]).length > 0).length;
    const withDist   = segments.filter(s => s.distance_km && s.distance_km > 0).length;
    console.log(`   ${withCoords} have path_coordinates, ${withDist} have distance_km.`);

    // Build adjacency list
    console.log(`   [${ts()}] Building adjacency list...`);
    const adjStart = Date.now();
    const adj = new Map<string, any[]>();
    for (const seg of segments) {
        if (!adj.has(seg.from_station_code)) adj.set(seg.from_station_code, []);
        if (!adj.has(seg.to_station_code)) adj.set(seg.to_station_code, []);
        adj.get(seg.from_station_code)!.push({ to: seg.to_station_code, segment: seg });
        adj.get(seg.to_station_code)!.push({ to: seg.from_station_code, segment: seg });
    }
    console.log(`   Adjacency list built: ${adj.size} nodes in ${elapsed(Date.now() - adjStart)}.\n`);

    // ── Step 3: Identify key nodes ────────────────────────────────────────
    console.log('Step 3: Identifying network nodes (junctions & real stations)...');
    const step3Start = Date.now();

    // Real stations (non-OSM_ codes) are ALWAYS section anchors regardless of degree,
    // because they appear mid-chain with degree 2 in the OSM geometry graph.
    // OSM nodes are only anchors when they are topological junctions (degree != 2).
    const keyNodeList = Array.from(adj.keys()).filter(code =>
        !code.startsWith('OSM_') || adj.get(code)!.length !== 2
    );
    const keyNodes = new Set(keyNodeList);

    const realStationAnchors = keyNodeList.filter(c => !c.startsWith('OSM_')).length;
    const osmTerminalAnchors = keyNodeList.filter(c => c.startsWith('OSM_') && adj.get(c)!.length === 1).length;
    const osmJunctionAnchors = keyNodeList.filter(c => c.startsWith('OSM_') && adj.get(c)!.length > 2).length;

    // Degree distribution of all nodes for sanity check
    const degreeMap: Record<number, number> = {};
    for (const [, edges] of adj) {
        const d = edges.length;
        degreeMap[d] = (degreeMap[d] || 0) + 1;
    }
    const degreeSummary = Object.entries(degreeMap).sort((a,b) => +a[0] - +b[0])
        .map(([d, n]) => `deg-${d}: ${n}`).join(', ');

    console.log(`   Key nodes: ${keyNodeList.length} total`);
    console.log(`     - Real station anchors : ${realStationAnchors}`);
    console.log(`     - OSM terminal anchors : ${osmTerminalAnchors} (dead ends)`);
    console.log(`     - OSM junction anchors : ${osmJunctionAnchors} (degree > 2)`);
    console.log(`   Node degree distribution : ${degreeSummary}`);
    console.log(`   Step 3 complete in ${elapsed(Date.now() - step3Start)}.\n`);

    // ── Step 4: Trace sections ────────────────────────────────────────────
    console.log('Step 4: Tracing logical sections between key nodes...');
    const step4Start = Date.now();
    const visitedSegments = new Set<number>();
    const sections: any[] = [];
    let processedNodes = 0;
    let safetyLimitHits = 0;
    let singleSegmentSections = 0;

    for (const startNode of keyNodeList) {
        processedNodes++;
        if (processedNodes % 500 === 0 || processedNodes === keyNodeList.length) {
            renderProgressBar(processedNodes, keyNodeList.length, 'Tracing Corridors');
        }

        const neighbors = adj.get(startNode)!;
        for (const startEdge of neighbors) {
            if (visitedSegments.has(startEdge.segment.id)) continue;

            const sectionSegments = [startEdge.segment];
            visitedSegments.add(startEdge.segment.id);

            let current = startEdge.to;
            let previous = startNode;

            // Walk through degree-2 OSM nodes until we hit a key node
            let safetyLimit = 5000;
            while (adj.get(current) && adj.get(current)!.length === 2 && !keyNodes.has(current) && safetyLimit > 0) {
                safetyLimit--;
                const nodeEdges = adj.get(current)!;
                const nextEdge = nodeEdges.find(e => e.to !== previous);
                if (!nextEdge || visitedSegments.has(nextEdge.segment.id)) break;
                sectionSegments.push(nextEdge.segment);
                visitedSegments.add(nextEdge.segment.id);
                previous = current;
                current = nextEdge.to;
            }
            if (safetyLimit === 0) safetyLimitHits++;
            if (sectionSegments.length === 1) singleSegmentSections++;

            // Aggregate properties
            const rawDist = sectionSegments.reduce((sum, s) => sum + (s.distance_km || 0), 0);
            const gauge = sectionSegments[0].gauge;
            const zoneCode = sectionSegments[0].zone_code;
            const electrified = sectionSegments.every(s => s.electrified);

            const typeCounts: Record<string, number> = {};
            const statusCounts: Record<string, number> = {};
            sectionSegments.forEach(s => {
                const t = s.track_type || 'Single';
                typeCounts[t] = (typeCounts[t] || 0) + 1;
                const st = s.status || 'Operational';
                statusCounts[st] = (statusCounts[st] || 0) + 1;
            });
            const domType   = Object.entries(typeCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || 'Single';
            const domStatus = Object.entries(statusCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || 'Operational';

            // Stitch coordinates
            const combinedCoords: any[] = [];
            let lastNode = startNode;
            for (const seg of sectionSegments) {
                let coords = seg.path_coordinates as any[];
                if (!coords || !Array.isArray(coords)) continue;
                if (seg.from_station_code !== lastNode) coords = [...coords].reverse();
                if (combinedCoords.length > 0 && coords.length > 0) {
                    const lp = combinedCoords[combinedCoords.length - 1];
                    const fp = coords[0];
                    if (lp[0] === fp[0] && lp[1] === fp[1]) combinedCoords.push(...coords.slice(1));
                    else combinedCoords.push(...coords);
                } else {
                    combinedCoords.push(...coords);
                }
                lastNode = (seg.from_station_code === lastNode) ? seg.to_station_code : seg.from_station_code;
            }

            const finalDist = rawDist > 0 ? rawDist : getHaversineDistance(combinedCoords);

            sections.push({
                from_node_code: startNode,
                to_node_code: current,
                distance_km: finalDist,
                gauge,
                status: domStatus,
                zone_code: zoneCode,
                track_type: domType,
                electrified,
                num_stations: sectionSegments.length + 1,
                path_coordinates: combinedCoords,
                segments_ids: sectionSegments.map(s => s.id)
            });
        }
    }

    // ── Step 4.5: Catch isolated loops (no key nodes) ─────────────────────
    let loopCount = 0;
    for (const seg of segments) {
        if (visitedSegments.has(seg.id)) continue;
        loopCount++;
        const sectionSegments = [seg];
        visitedSegments.add(seg.id);

        let startNode = seg.from_station_code;
        let current = seg.to_station_code;
        let previous = seg.from_station_code;

        let safetyLimit = 5000;
        while (current !== startNode && safetyLimit > 0) {
            safetyLimit--;
            const nodeEdges = adj.get(current)!;
            const nextEdge = nodeEdges?.find(e => e.to !== previous);
            if (!nextEdge || visitedSegments.has(nextEdge.segment.id)) break;
            sectionSegments.push(nextEdge.segment);
            visitedSegments.add(nextEdge.segment.id);
            previous = current;
            current = nextEdge.to;
        }

        const rawDist = sectionSegments.reduce((sum, s) => sum + (s.distance_km || 0), 0);
        const combinedCoords: any[] = [];
        let lastNode = startNode;
        for (const s of sectionSegments) {
            let coords = s.path_coordinates as any[];
            if (!coords || !Array.isArray(coords)) continue;
            if (s.from_station_code !== lastNode) coords = [...coords].reverse();
            if (combinedCoords.length > 0 && coords.length > 0) {
                const lp = combinedCoords[combinedCoords.length-1];
                const fp = coords[0];
                if (lp[0] === fp[0] && lp[1] === fp[1]) combinedCoords.push(...coords.slice(1));
                else combinedCoords.push(...coords);
            } else combinedCoords.push(...coords);
            lastNode = (s.from_station_code === lastNode) ? s.to_station_code : s.from_station_code;
        }

        sections.push({
            from_node_code: startNode,
            to_node_code: current,
            distance_km: rawDist > 0 ? rawDist : getHaversineDistance(combinedCoords),
            gauge: sectionSegments[0].gauge,
            status: sectionSegments[0].status || 'Operational',
            zone_code: sectionSegments[0].zone_code,
            track_type: sectionSegments[0].track_type || 'Single',
            electrified: sectionSegments.every(s => s.electrified),
            num_stations: sectionSegments.length,
            path_coordinates: combinedCoords,
            segments_ids: sectionSegments.map(s => s.id)
        });
    }

    const step4End = Date.now();
    const totalDist = sections.reduce((sum, s) => sum + s.distance_km, 0);
    const realToReal = sections.filter(s => !s.from_node_code.startsWith('OSM_') && !s.to_node_code.startsWith('OSM_')).length;
    const realToOsm  = sections.filter(s => !s.from_node_code.startsWith('OSM_') !== !s.to_node_code.startsWith('OSM_')).length;
    const osmToOsm   = sections.filter(s => s.from_node_code.startsWith('OSM_') && s.to_node_code.startsWith('OSM_')).length;
    const unvisited  = segments.length - visitedSegments.size;

    process.stdout.write('\n');
    console.log(`   Sections generated  : ${sections.length}`);
    console.log(`     - Real ↔ Real     : ${realToReal}`);
    console.log(`     - Real ↔ OSM      : ${realToOsm}`);
    console.log(`     - OSM  ↔ OSM      : ${osmToOsm}`);
    console.log(`   Total distance      : ${totalDist.toFixed(1)} km`);
    console.log(`   Single-seg sections : ${singleSegmentSections}`);
    console.log(`   Safety-limit hits   : ${safetyLimitHits}`);
    console.log(`   Isolated loops      : ${loopCount}`);
    console.log(`   Unvisited segments  : ${unvisited}`);
    console.log(`   Step 4 complete in ${elapsed(step4End - step4Start)}.\n`);

    // ── Step 5: Persist to DB ─────────────────────────────────────────────
    console.log('Step 5: Persisting logical corridors to DB...');
    const step5Start = Date.now();
    const CHUNK_SIZE = 50;
    let saved = 0;

    try {
        for (let i = 0; i < sections.length; i += CHUNK_SIZE) {
            const chunk = sections.slice(i, i + CHUNK_SIZE);
            await prisma.$transaction(
                chunk.map(sec => prisma.trackSection.create({
                    data: {
                        from_node_code: sec.from_node_code,
                        to_node_code: sec.to_node_code,
                        distance_km: sec.distance_km,
                        gauge: sec.gauge,
                        status: sec.status,
                        zone_code: sec.zone_code,
                        track_type: sec.track_type,
                        electrified: sec.electrified,
                        num_stations: sec.num_stations,
                        path_coordinates: sec.path_coordinates,
                        segments: {
                            connect: sec.segments_ids.map((id: number) => ({ id }))
                        }
                    }
                }))
            );
            saved += chunk.length;
            renderProgressBar(saved, sections.length, 'Saving');

            // Periodic timing log every 10 chunks
            if ((i / CHUNK_SIZE) % 10 === 9) {
                const rate = saved / ((Date.now() - step5Start) / 1000);
                const remaining = ((sections.length - saved) / rate).toFixed(0);
                process.stdout.write(`\n   [${ts()}] ${saved}/${sections.length} saved @ ${rate.toFixed(0)}/s — ~${remaining}s remaining\n`);
            }
        }

        process.stdout.write('\n');
        console.log(`   Step 5 complete in ${elapsed(Date.now() - step5Start)}.`);
    } catch (err: any) {
        process.stdout.write('\n');
        console.error(`\n❌ SAVE FAILED at section ~${saved}:`);
        console.error(err.message || err);
        process.exit(1);
    }

    const totalTime = Date.now() - startTime;
    console.log('\n========================================');
    console.log(`   COMPLETED AT: ${ts()}`);
    console.log(`   TOTAL TIME:   ${elapsed(totalTime)}`);
    console.log('========================================\n');

    await prisma.$disconnect();
}

main().catch(console.error);
