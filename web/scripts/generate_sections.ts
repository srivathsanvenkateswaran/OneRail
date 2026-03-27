import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('\n--- OneRail Section Generator ---');
    
    console.log('Step 1: Clearing existing track sections...');
    const deleted = await prisma.trackSection.deleteMany();
    console.log(`   Done. Removed ${deleted.count} legacy sections.`);

    console.log('\nStep 2: Loading track segment graph into memory...');
    const segments = await prisma.trackSegment.findMany({
        select: {
            id: true,
            from_station_code: true,
            to_station_code: true,
            distance_km: true,
            track_type: true,
            electrified: true,
            gauge: true,
            zone_code: true,
            path_coordinates: true
        }
    });
    console.log(`   Done. Loaded ${segments.length} segments.`);

    // Build Adjacency List
    const adj = new Map<string, any[]>();
    for (const seg of segments) {
        if (!adj.has(seg.from_station_code)) adj.set(seg.from_station_code, []);
        if (!adj.has(seg.to_station_code)) adj.set(seg.to_station_code, []);
        adj.get(seg.from_station_code)!.push({ to: seg.to_station_code, segment: seg });
        adj.get(seg.to_station_code)!.push({ to: seg.from_station_code, segment: seg });
    }

    console.log('\nStep 3: Identifying network nodes (Junctions or Terminals)...');
    // A node is a Key Node if degree != 2 in the graph
    const keyNodeList = Array.from(adj.keys()).filter(code => adj.get(code)!.length !== 2);
    const keyNodes = new Set(keyNodeList); // CRITICAL: O(1) lookups
    console.log(`   Done. Found ${keyNodeList.length} key nodes to anchor sections.`);

    console.log('\nStep 4: Tracing logical sections between key nodes...');
    const visitedSegments = new Set<number>();
    const sections: any[] = [];
    let processedNodes = 0;

    for (const startNode of keyNodeList) {
        processedNodes++;
        if (processedNodes % 500 === 0) {
            console.log(`   Tracing: ${processedNodes} / ${keyNodeList.length} nodes...`);
        }

        const neighbors = adj.get(startNode)!;
        for (const startEdge of neighbors) {
            if (visitedSegments.has(startEdge.segment.id)) continue;

            const sectionSegments = [startEdge.segment];
            visitedSegments.add(startEdge.segment.id);
            
            let current = startEdge.to;
            let previous = startNode;

            // Chain through degree-2 stops until another junction or terminal is hit
            // Loop limit added for safety
            let safetyLimit = 1000;
            while (adj.get(current)!.length === 2 && !keyNodes.has(current) && safetyLimit > 0) {
                safetyLimit--;
                const nodeEdges = adj.get(current)!;
                const nextEdge = nodeEdges.find(e => e.to !== previous);
                
                if (!nextEdge || visitedSegments.has(nextEdge.segment.id)) break;
                
                sectionSegments.push(nextEdge.segment);
                visitedSegments.add(nextEdge.segment.id);
                previous = current;
                current = nextEdge.to;
            }

            // Aggregate properties
            const dist = sectionSegments.reduce((sum, s) => sum + (s.distance_km || 0), 0);
            const gauge = sectionSegments[0].gauge;
            const zoneCode = sectionSegments[0].zone_code;
            const electrified = sectionSegments.every(s => s.electrified);
            const typeCounts: Record<string, number> = {};
            sectionSegments.forEach(s => { const t = s.track_type || 'Single'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
            const domType = Object.entries(typeCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || 'Single';

            // Merge LineString coordinates
            const combinedCoords: any[] = [];
            let lastNode = startNode;
            for (const seg of sectionSegments) {
                let coords = seg.path_coordinates as any[];
                if (!coords) continue;
                if (seg.from_station_code !== lastNode) {
                    coords = [...coords].reverse();
                }
                combinedCoords.push(...coords);
                lastNode = (seg.from_station_code === lastNode) ? seg.to_station_code : seg.from_station_code;
            }

            sections.push({
                from_node_code: startNode,
                to_node_code: current,
                distance_km: dist,
                gauge,
                zone_code: zoneCode,
                track_type: domType,
                electrified,
                num_stations: sectionSegments.length + 1,
                path_coordinates: combinedCoords,
                segments_ids: sectionSegments.map(s => s.id)
            });
        }
    }
    console.log(`\n   Success. Grouped segments into ${sections.length} logical sections.`);

    console.log('\nStep 5: Persisting sections & linking segments (Batching)...');
    const CHUNK_SIZE = 100;
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
                        zone_code: sec.zone_code,
                        track_type: sec.track_type,
                        electrified: sec.electrified,
                        num_stations: sec.num_stations,
                        path_coordinates: sec.path_coordinates,
                        segments: {
                            connect: sec.segments_ids.map(id => ({ id }))
                        }
                    }
                }))
            );
            if (i % 1000 === 0 || i + CHUNK_SIZE >= sections.length) {
                console.log(`   Saving: ${Math.min(i + CHUNK_SIZE, sections.length)} / ${sections.length} sections...`);
            }
        }
    } catch (err: any) {
        console.error('\n❌ CRITICAL ERROR DURING SAVE:');
        console.error(err);
        console.error('Check fields, types, and constraints.');
        process.exit(1);
    }

    console.log('\n✅ ALL LOGICAL TRACK SECTIONS SYNCHRONIZED!');
    await prisma.$disconnect();
}

main().catch(console.error);
