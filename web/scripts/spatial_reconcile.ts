import { prisma } from '../src/lib/prisma';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function main() {
    console.log('--- Spatial Reconciliation: OSM Hubs -> Real Stations ---');

    // 1. Load all real stations with coordinates
    const realStations = await prisma.station.findMany({
        where: {
            station_code: { not: { startsWith: 'OSM_' } },
            latitude: { not: null },
            longitude: { not: null }
        }
    });
    console.log(`Loaded ${realStations.length} real stations.`);

    // 2. Load all virtual hubs with coordinates
    const virtualHubs = await prisma.station.findMany({
        where: {
            station_code: { startsWith: 'OSM_' },
            latitude: { not: null },
            longitude: { not: null }
        }
    });
    console.log(`Loaded ${virtualHubs.length} virtual hubs.`);

    const MAX_RADIUS_KM = 0.5; // 500 meters
    let remappedCount = 0;
    let fromUpdated = 0;
    let toUpdated = 0;

    const grid = new Map<string, any[]>();
    const GRID_SIZE = 0.05; // ~5km

    for (const vh of virtualHubs) {
        const gx = Math.floor(vh.longitude! / GRID_SIZE);
        const gy = Math.floor(vh.latitude! / GRID_SIZE);
        const key = `${gx},${gy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(vh);
    }

    for (const rs of realStations) {
        const gx = Math.floor(rs.longitude! / GRID_SIZE);
        const gy = Math.floor(rs.latitude! / GRID_SIZE);
        
        const nearbyVh: any[] = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = `${gx + dx},${gy + dy}`;
                if (grid.has(key)) nearbyVh.push(...grid.get(key)!);
            }
        }

        let bestVh: any = null;
        let minDist = MAX_RADIUS_KM;

        for (const vh of nearbyVh) {
            const d = getDistance(rs.latitude!, rs.longitude!, vh.latitude!, vh.longitude!);
            if (d < minDist) {
                minDist = d;
                bestVh = vh;
            }
        }

        if (bestVh) {
            const vhCode = bestVh.station_code;
            const rsCode = rs.station_code;

            const fromSegments = await prisma.trackSegment.findMany({
                where: { from_station_code: vhCode }
            });

            for (const seg of fromSegments) {
                try {
                    await prisma.trackSegment.update({
                        where: { id: seg.id },
                        data: { from_station_code: rsCode }
                    });
                    fromUpdated++;
                } catch (e: any) {
                    if (e.code === 'P2002') {
                        await prisma.trackSegment.delete({ where: { id: seg.id } });
                    }
                }
            }

            const toSegments = await prisma.trackSegment.findMany({
                where: { to_station_code: vhCode }
            });

            for (const seg of toSegments) {
                try {
                    await prisma.trackSegment.update({
                        where: { id: seg.id },
                        data: { to_station_code: rsCode }
                    });
                    toUpdated++;
                } catch (e: any) {
                    if (e.code === 'P2002') {
                        await prisma.trackSegment.delete({ where: { id: seg.id } });
                    }
                }
            }

            if (fromSegments.length > 0 || toSegments.length > 0) {
                remappedCount++;
                const displayName = rs.station_name.includes(`(${rs.station_code})`) 
                    ? rs.station_name 
                    : `${rs.station_name} (${rs.station_code})`;
                
                await prisma.station.update({
                    where: { station_code: rs.station_code },
                    data: { station_name: displayName }
                });

                try {
                    await prisma.station.delete({ where: { station_code: vhCode } });
                } catch (e) {}
            }
        }

        if (remappedCount % 100 === 0 && remappedCount > 0) {
            process.stdout.write(`Progress: Remapped ${remappedCount} hubs...\r`);
        }
    }

    console.log(`\nSuccess!`);
    console.log(`- Hubs remapped: ${remappedCount}`);
    console.log(`- 'from' references updated: ${fromUpdated}`);
    console.log(`- 'to' references updated: ${toUpdated}`);
    console.log(`\n🚀 Please re-run npx tsx scripts/generate_sections.ts to apply changes.`);
}

main().catch(console.error);
