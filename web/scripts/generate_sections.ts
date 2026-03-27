import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// ── Helpers (External for Engine Optimization) ────────────────────────────────

function getHaversineDistance(coords: any[]) {
    if (!coords || !Array.isArray(coords) || coords.length < 2) return 0;
    
    let totalD = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i];
        const [lon2, lat2] = coords[i+1];
        if (typeof lat1 !== 'number' || typeof lat2 !== 'number') continue;

        const R = 6371; // km
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

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n========================================');
    console.log('   ONERAIL SECTION GENERATOR [v4]');
    console.log('   Starting at: ' + new Date().toLocaleTimeString());
    console.log('========================================\n');
    
    console.log('Step 1: Clearing existing track sections...');
    console.log('   (Note: Purging cascades and joins, this may take up to 2 minutes...)');
    
    // Heartbeat during potentially long delete
    const heartbeat = setInterval(() => {
        process.stdout.write(`   Step 1 Progress: Still purging graph... [${new Date().toLocaleTimeString()}]\r`);
    }, 5000);

    const deleted = await prisma.trackSection.deleteMany();
    clearInterval(heartbeat);
    console.log(`\n   Success. Purged ${deleted.count} existing sections.`);

    console.log('\nStep 2: Loading track segments into memory...');
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
    const keyNodeList = Array.from(adj.keys()).filter(code => adj.get(code)!.length !== 2);
    const keyNodes = new Set(keyNodeList);
    console.log(`   Done. Found ${keyNodeList.length} key nodes to anchor sections.`);

    console.log('\nStep 4: Tracing logical sections between key nodes...');
    const visitedSegments = new Set<number>();
    const sections: any[] = [];
    let processedNodes = 0;

    for (const startNode of keyNodes) {
        processedNodes++;
        // Throttled logging for better performance
        if (processedNodes % 200 === 0 || processedNodes === keyNodes.size) {
            const pct = ((processedNodes / keyNodes.size) * 100).toFixed(1);
            process.stdout.write(`   Tracing Corridors: ${pct}% (${processedNodes}/${keyNodes.size} nodes)\r`);
        }

        const neighbors = adj.get(startNode)!;
        for (const startEdge of neighbors) {
            if (visitedSegments.has(startEdge.segment.id)) continue;

            const sectionSegments = [startEdge.segment];
            visitedSegments.add(startEdge.segment.id);
            
            let current = startEdge.to;
            let previous = startNode;

            // Chain through linear stops (degree 2) until a hub is hit
            let safetyLimit = 5000;
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

            // Aggregate logical properties
            const rawDist = sectionSegments.reduce((sum, s) => sum + (s.distance_km || 0), 0);
            const gauge = sectionSegments[0].gauge;
            const zoneCode = sectionSegments[0].zone_code;
            const electrified = sectionSegments.every(s => s.electrified);
            
            // Majority vote for track type
            const typeCounts: Record<string, number> = {};
            sectionSegments.forEach(s => { 
                const t = s.track_type || 'Single'; 
                typeCounts[t] = (typeCounts[t] || 0) + 1; 
            });
            const domType = Object.entries(typeCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || 'Single';

            // Coordinates collection
            const combinedCoords: any[] = [];
            let lastNode = startNode;
            for (const seg of sectionSegments) {
                let coords = seg.path_coordinates as any[];
                if (!coords || !Array.isArray(coords)) continue;
                if (seg.from_station_code !== lastNode) {
                    coords = [...coords].reverse();
                }
                combinedCoords.push(...coords);
                lastNode = (seg.from_station_code === lastNode) ? seg.to_station_code : seg.from_station_code;
            }

            // Calculate precise distance from geometry if missing
            const finalDist = rawDist > 0 ? rawDist : getHaversineDistance(combinedCoords);

            sections.push({
                from_node_code: startNode,
                to_node_code: current,
                distance_km: finalDist,
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
    process.stdout.write('\n   Done. Successfully grouped logica corridors.');
    const totalDist = sections.reduce((sum, s) => sum + s.distance_km, 0);
    console.log(`\n   Success. Found ${sections.length} sections spanning ${totalDist.toFixed(1)} km.`);

    console.log('\nStep 5: Persisting logical corridors to DB (Batching)...');
    const CHUNK_SIZE = 50; 
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
                            connect: sec.segments_ids.map((id: number) => ({ id }))
                        }
                    }
                }))
            );
            
            const savedCount = Math.min(i + CHUNK_SIZE, sections.length);
            const pct = ((savedCount / sections.length) * 100).toFixed(1);
            process.stdout.write(`   Saving Corridor Graph: ${pct}% (${savedCount}/${sections.length} sections)\r`);
        }
        process.stdout.write('\n✅ ALL SECTIONS PERSISTED TO PRODUCTION!\n');
    } catch (err: any) {
        console.error('\n❌ CRITICAL ERROR DURING SAVE:');
        console.error(err.message || err);
        process.exit(1);
    }
    await prisma.$disconnect();
}

main().catch(console.error);
