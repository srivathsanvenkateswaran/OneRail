import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import readline from 'readline';

function printProgress(msg: string) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(msg);
}

// Quick euclidean squared distance. Good enough for approximation mapping over small regions.
function distSq(lon1: number, lat1: number, lon2: number, lat2: number) {
    return (lon1 - lon2) ** 2 + (lat1 - lat2) ** 2;
}

async function main() {
    console.log('Fetching stations with known zones...');
    const stations = await prisma.station.findMany({
        where: { zone_code: { not: null }, latitude: { not: null }, longitude: { not: null } },
        select: { station_code: true, zone_code: true, latitude: true, longitude: true }
    });
    console.log(`Found ${stations.length} reliable IR stations with Zones and coords.`);

    console.log('Fetching tracks needing zone assignment...');
    // We only need the tracks without zones
    const tracks = await prisma.trackSegment.findMany({
        where: { zone_code: null },
        select: { id: true, path_coordinates: true }
    });
    console.log(`Analyzing ${tracks.length} track segments...`);

    let assigned = 0;
    const updates: { id: number; zone_code: string }[] = [];

    for (let i = 0; i < tracks.length; i++) {
        const trk = tracks[i];
        const coords = trk.path_coordinates as any[];
        
        if (!coords || !coords.length) continue;

        // Take a sample coordinate out of the track geometry line
        const midPoint = coords[Math.floor(coords.length / 2)];
        const [lon, lat] = midPoint;
        
        if (typeof lon !== 'number' || typeof lat !== 'number') continue;

        // Find nearest station
        let nearestZone = null;
        let minD = Infinity;

        for (const st of stations) {
            const d = distSq(lon, lat, st.longitude!, st.latitude!);
            if (d < minD) {
                minD = d;
                nearestZone = st.zone_code;
            }
        }

        if (nearestZone) {
            updates.push({ id: trk.id, zone_code: nearestZone });
            assigned++;
        }

        if (i % 500 === 0) printProgress(`  → Processed ${i}/${tracks.length} tracks...`);
    }

    console.log(`\nFound closest Zones for ${assigned} tracks. Saving updates to database...`);
    
    // Update sequentially via unlogged transactions or chunks instead of 1 by 1
    const CHUNK_SIZE = 500;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        
        await prisma.$transaction(
            chunk.map(u => prisma.trackSegment.update({
                where: { id: u.id },
                data: { zone_code: u.zone_code }
            }))
        );
        printProgress(`  → Saved ${Math.min(i + CHUNK_SIZE, updates.length)} / ${updates.length}...`);
    }

    console.log(`\n✅ Completely synchronized Track Zones!`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
